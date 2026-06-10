import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { DEFAULT_CEILING_HEIGHT_MM, createEmptyProject, createFloor } from '../../model/factories'
import type { Project } from '../../model/types'
import {
  SET_UNITS,
  addFloor,
  registerProjectCommands,
  removeFloor,
  renameFloor,
  renameProject,
  reorderFloor,
  setFloorCeilingHeight,
  setFloorElevation,
  setFloorPeriod,
  setFloorStyle,
  setProjectPeriod,
  setUnits,
} from './project-commands'

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
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

  it('switches the project units and restores the prior system on undo', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)

    const command = setUnits('imperial')
    expect(command.type).toBe(SET_UNITS)
    expect(command.params.units).toBe('imperial')

    dispatcher.dispatch(command)
    expect(state.meta.units).toBe('imperial')
    expect(state.meta.name).toBe('House')
    expect(state.floors).toEqual([])

    dispatcher.undo()
    expect(state.meta.units).toBe('metric')
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

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [createFloor('Ground', { id: 'floor-1' })]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  return new Dispatcher(project, registerProjectCommands(new CommandRegistry<Project>()))
}

describe('setFloorPeriod', () => {
  it('tags a floor with a period', () => {
    const project = projectWithFloor()

    dispatcherFor(project).dispatch(setFloorPeriod('floor-1', 'edwardian'))

    expect(project.floors[0]?.periodOverride).toBe('edwardian')
  })

  it('restores the prior period on undo', () => {
    const project = projectWithFloor()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setFloorPeriod('floor-1', 'edwardian'))

    dispatcher.undo()

    expect(project.floors[0]?.periodOverride).toBeUndefined()
  })
})

describe('setFloorStyle', () => {
  it('tags a floor with a style and the vernacular modifier', () => {
    const project = projectWithFloor()

    dispatcherFor(project).dispatch(
      setFloorStyle('floor-1', { styleId: 'gothic-revival', vernacular: true }),
    )

    expect(project.floors[0]?.styleOverride).toEqual({
      styleId: 'gothic-revival',
      vernacular: true,
    })
  })
})

describe('setProjectPeriod', () => {
  it('changes the project default period and restores it on undo', () => {
    const project = projectWithFloor()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setProjectPeriod('interwar'))
    expect(project.meta.period).toBe('interwar')

    dispatcher.undo()
    expect(project.meta.period).toBe('victorian')
  })
})

function projectWithTwoFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [createFloor('Ground', { id: 'f1' }), createFloor('Upper', { id: 'f2' })]
  return project
}

describe('renameFloor', () => {
  it('renames only the target floor and restores the prior name on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(renameFloor('f2', 'Second Floor'))
    expect(project.floors[1]?.name).toBe('Second Floor')
    expect(project.floors[0]?.name).toBe('Ground')

    dispatcher.undo()
    expect(project.floors[1]?.name).toBe('Upper')
  })
})

function projectWithGroundFloor(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [createFloor('Ground', { id: 'f1', elevation: 0 })]
  return project
}

describe('setFloorElevation', () => {
  it("sets the target floor's elevation and restores the prior value on undo", () => {
    const project = projectWithGroundFloor()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setFloorElevation('f1', 3000))
    expect(project.floors[0]?.elevation).toBe(3000)

    dispatcher.undo()
    expect(project.floors[0]?.elevation).toBe(0)
  })

  it('coalesces successive elevation edits on the same floor into one undo step', () => {
    const project = projectWithGroundFloor()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setFloorElevation('f1', 1000))
    dispatcher.dispatch(setFloorElevation('f1', 2000))
    expect(project.floors[0]?.elevation).toBe(2000)

    dispatcher.undo()
    expect(project.floors[0]?.elevation).toBe(0)
  })
})

function projectWithThreeFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [
    createFloor('Basement', { id: 'a' }),
    createFloor('Ground', { id: 'b' }),
    createFloor('Upper', { id: 'c' }),
  ]
  return project
}

describe('reorderFloor', () => {
  it('moves a floor to a new index and restores the original order on undo', () => {
    const project = projectWithThreeFloors()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(reorderFloor('c', 0))
    expect(project.floors.map((floor) => floor.id)).toEqual(['c', 'a', 'b'])

    dispatcher.undo()
    expect(project.floors.map((floor) => floor.id)).toEqual(['a', 'b', 'c'])
  })
})
