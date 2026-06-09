import { describe, it, expect } from 'vitest'
import {
  addDimension,
  removeDimension,
  registerDimensionCommands,
  ADD_DIMENSION,
  REMOVE_DIMENSION,
} from './dimension-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor, createDimension } from '../../model/factories'
import type { Dimension, Project } from '../../model/types'

function newDimension(end = { x: 1000, y: 0 }): Dimension {
  return createDimension({ start: { x: 0, y: 0 }, end })
}

function projectWithTwoFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' }), createFloor('Upper', { id: 'u' })]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerDimensionCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('addDimension', () => {
  it('appends the dimension to the target floor', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const dimension = newDimension()

    dispatcher.dispatch(addDimension('g', dimension))

    expect(project.floors[0]?.dimensions).toEqual([dimension])
  })

  it('leaves the sibling floor reference-equal', () => {
    const project = projectWithTwoFloors()
    const sibling = project.floors[1]
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(addDimension('g', newDimension()))

    expect(project.floors[1]).toBe(sibling)
  })

  it('removes the appended dimension on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addDimension('g', newDimension()))

    dispatcher.undo()

    expect(project.floors[0]?.dimensions).toEqual([])
  })

  it('carries a stable command type', () => {
    expect(addDimension('g', newDimension()).type).toBe(ADD_DIMENSION)
  })
})

describe('removeDimension', () => {
  it('filters the target dimension out while a sibling remains', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newDimension()
    const sibling = newDimension({ x: 2000, y: 0 })
    dispatcher.dispatch(addDimension('g', target))
    dispatcher.dispatch(addDimension('g', sibling))

    dispatcher.dispatch(removeDimension('g', target.id))

    expect(project.floors[0]?.dimensions).toEqual([sibling])
  })

  it('leaves the other dimension reference-equal', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newDimension()
    const sibling = newDimension({ x: 2000, y: 0 })
    dispatcher.dispatch(addDimension('g', target))
    dispatcher.dispatch(addDimension('g', sibling))

    dispatcher.dispatch(removeDimension('g', target.id))

    expect(project.floors[0]?.dimensions[0]).toBe(sibling)
  })

  it('restores the removed dimension at its original index on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const first = newDimension({ x: 1000, y: 0 })
    const middle = newDimension({ x: 2000, y: 0 })
    const last = newDimension({ x: 3000, y: 0 })
    dispatcher.dispatch(addDimension('g', first))
    dispatcher.dispatch(addDimension('g', middle))
    dispatcher.dispatch(addDimension('g', last))

    dispatcher.dispatch(removeDimension('g', middle.id))
    dispatcher.undo()

    expect(project.floors[0]?.dimensions).toEqual([first, middle, last])
  })

  it('carries a stable command type', () => {
    expect(removeDimension('g', 'dimension-1').type).toBe(REMOVE_DIMENSION)
  })
})
