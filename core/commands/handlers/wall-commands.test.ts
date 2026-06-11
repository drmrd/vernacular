import { describe, it, expect } from 'vitest'
import {
  addWall,
  moveWallEndpoint,
  setWallThickness,
  registerWallCommands,
  ADD_WALL,
} from './wall-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import {
  createEmptyProject,
  createFloor,
  createWall,
  DEFAULT_WALL_THICKNESS_MM,
} from '../../model/factories'
import type { Project } from '../../model/types'

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'modern',
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

const TARGET_START = { x: 0, y: 0 }
const TARGET_END = { x: 1000, y: 0 }
const TARGET_THICKNESS = 200
const SIBLING_START = { x: 0, y: 2000 }
const SIBLING_END = { x: 1000, y: 2000 }
const MOVED_POINT = { x: 500, y: 750 }
const NEW_THICKNESS = 350

function projectWithTwoWalls(): Project {
  const project = projectWithFloor()
  project.floors[0]!.walls = [
    createWall(TARGET_START, TARGET_END, { id: 'target', thickness: TARGET_THICKNESS }),
    createWall(SIBLING_START, SIBLING_END, { id: 'sibling' }),
  ]
  return project
}

describe('moveWallEndpoint', () => {
  it('replaces the start endpoint while leaving the end and thickness untouched', () => {
    const project = projectWithTwoWalls()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(moveWallEndpoint('g', 'target', 'start', MOVED_POINT))

    const target = project.floors[0]!.walls[0]!
    expect(target.start).toEqual(MOVED_POINT)
    expect(target.end).toEqual(TARGET_END)
    expect(target.thickness).toBe(TARGET_THICKNESS)
  })

  it('replaces the end endpoint while leaving the start and thickness untouched', () => {
    const project = projectWithTwoWalls()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(moveWallEndpoint('g', 'target', 'end', MOVED_POINT))

    const target = project.floors[0]!.walls[0]!
    expect(target.end).toEqual(MOVED_POINT)
    expect(target.start).toEqual(TARGET_START)
    expect(target.thickness).toBe(TARGET_THICKNESS)
  })

  it('leaves a sibling wall on the same floor untouched', () => {
    const project = projectWithTwoWalls()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(moveWallEndpoint('g', 'target', 'start', MOVED_POINT))

    const sibling = project.floors[0]!.walls[1]!
    expect(sibling.start).toEqual(SIBLING_START)
    expect(sibling.end).toEqual(SIBLING_END)
  })

  it('restores the original endpoint on undo', () => {
    const project = projectWithTwoWalls()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(moveWallEndpoint('g', 'target', 'start', MOVED_POINT))

    dispatcher.undo()

    expect(project.floors[0]!.walls[0]!.start).toEqual(TARGET_START)
  })
})

describe('setWallThickness', () => {
  it('sets the thickness while leaving the endpoints untouched', () => {
    const project = projectWithTwoWalls()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setWallThickness('g', 'target', NEW_THICKNESS))

    const target = project.floors[0]!.walls[0]!
    expect(target.thickness).toBe(NEW_THICKNESS)
    expect(target.start).toEqual(TARGET_START)
    expect(target.end).toEqual(TARGET_END)
  })

  it('leaves a sibling wall on the same floor untouched', () => {
    const project = projectWithTwoWalls()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setWallThickness('g', 'target', NEW_THICKNESS))

    const sibling = project.floors[0]!.walls[1]!
    expect(sibling.thickness).toBe(DEFAULT_WALL_THICKNESS_MM)
    expect(sibling.start).toEqual(SIBLING_START)
    expect(sibling.end).toEqual(SIBLING_END)
  })

  it('restores the previous thickness on undo', () => {
    const project = projectWithTwoWalls()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setWallThickness('g', 'target', NEW_THICKNESS))

    dispatcher.undo()

    expect(project.floors[0]!.walls[0]!.thickness).toBe(TARGET_THICKNESS)
  })
})
