import { describe, it, expect } from 'vitest'
import { addWall, registerWallCommands, ADD_WALL } from './wall-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor } from '../../model/factories'
import type { Project } from '../../model/types'

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' })]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerWallCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('addWall', () => {
  it('appends a wall to the named floor', () => {
    const project = projectWithFloor()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(addWall('g', { x: 0, y: 0 }, { x: 1000, y: 0 }))

    expect(project.floors[0]?.walls).toHaveLength(1)
    expect(project.floors[0]?.walls[0]?.start).toEqual({ x: 0, y: 0 })
    expect(project.floors[0]?.walls[0]?.end).toEqual({ x: 1000, y: 0 })
  })

  it('reuses the same wall id on redo', () => {
    const project = projectWithFloor()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addWall('g', { x: 0, y: 0 }, { x: 1000, y: 0 }))
    const drawnId = project.floors[0]!.walls[0]!.id

    dispatcher.undo()
    dispatcher.redo()

    expect(project.floors[0]!.walls[0]!.id).toBe(drawnId)
  })

  it('leaves other floors untouched', () => {
    const project = projectWithFloor()
    project.floors = [...project.floors, createFloor('Upper', { id: 'u' })]
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(addWall('g', { x: 0, y: 0 }, { x: 1, y: 1 }))

    expect(project.floors[1]?.walls).toHaveLength(0)
  })

  it('carries a stable command type', () => {
    expect(addWall('g', { x: 0, y: 0 }, { x: 1, y: 1 }).type).toBe(ADD_WALL)
  })
})
