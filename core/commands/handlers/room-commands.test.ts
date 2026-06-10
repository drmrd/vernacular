import { describe, it, expect } from 'vitest'
import { setRoomName, setRoomCustomPolygon, registerRoomCommands } from './room-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import type { Point } from '../../index'
import type { Project } from '../../model/types'

const TARGET_KEY = 'room:wall-a|wall-b'
const SIBLING_KEY = 'room:wall-c|wall-d'
const SIBLING_NAME = 'Parlor'

const POLYGON_MIN = 0
const POLYGON_MAX = 1000
const CUSTOM_POLYGON: Point[] = [
  { x: POLYGON_MIN, y: POLYGON_MIN },
  { x: POLYGON_MAX, y: POLYGON_MIN },
  { x: POLYGON_MAX, y: POLYGON_MAX },
  { x: POLYGON_MIN, y: POLYGON_MAX },
]
const SIBLING_POLYGON: Point[] = [
  { x: POLYGON_MIN, y: POLYGON_MIN },
  { x: POLYGON_MAX, y: POLYGON_MIN },
  { x: POLYGON_MIN, y: POLYGON_MAX },
]

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerRoomCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('setRoomName', () => {
  it('creates the overrides map and entry when none exists', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Kitchen'))

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Kitchen')
  })

  it('renames a room while leaving a sibling override untouched', () => {
    const project = newProject()
    project.roomOverrides = {
      [TARGET_KEY]: { name: 'Kitchen' },
      [SIBLING_KEY]: { name: SIBLING_NAME },
    }
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Scullery'))

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Scullery')
    expect(project.roomOverrides?.[SIBLING_KEY]?.name).toBe(SIBLING_NAME)
  })

  it('restores absent overrides on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Kitchen'))

    dispatcher.undo()

    expect(project.roomOverrides).toBeUndefined()
  })

  it('restores the prior name on undo when an override existed before', () => {
    const project = newProject()
    project.roomOverrides = { [TARGET_KEY]: { name: 'Kitchen' } }
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Scullery'))

    dispatcher.undo()

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Kitchen')
  })
})

describe('setRoomCustomPolygon', () => {
  it('creates the overrides map and entry when none exists', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomCustomPolygon(TARGET_KEY, CUSTOM_POLYGON))

    expect(project.roomOverrides?.[TARGET_KEY]?.customPolygon).toEqual(CUSTOM_POLYGON)
  })

  it('sets the polygon while preserving an existing name on the entry', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Kitchen'))

    dispatcher.dispatch(setRoomCustomPolygon(TARGET_KEY, CUSTOM_POLYGON))

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Kitchen')
    expect(project.roomOverrides?.[TARGET_KEY]?.customPolygon).toEqual(CUSTOM_POLYGON)
  })

  it('sets the polygon while leaving a sibling override untouched', () => {
    const project = newProject()
    project.roomOverrides = {
      [SIBLING_KEY]: { name: SIBLING_NAME, customPolygon: SIBLING_POLYGON },
    }
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomCustomPolygon(TARGET_KEY, CUSTOM_POLYGON))

    expect(project.roomOverrides?.[TARGET_KEY]?.customPolygon).toEqual(CUSTOM_POLYGON)
    expect(project.roomOverrides?.[SIBLING_KEY]?.name).toBe(SIBLING_NAME)
    expect(project.roomOverrides?.[SIBLING_KEY]?.customPolygon).toEqual(SIBLING_POLYGON)
  })

  it('restores absent overrides on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomCustomPolygon(TARGET_KEY, CUSTOM_POLYGON))

    dispatcher.undo()

    expect(project.roomOverrides).toBeUndefined()
  })

  it('restores the prior entry on undo when an override existed before', () => {
    const project = newProject()
    project.roomOverrides = { [TARGET_KEY]: { name: 'Kitchen' } }
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomCustomPolygon(TARGET_KEY, CUSTOM_POLYGON))

    dispatcher.undo()

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Kitchen')
    expect(project.roomOverrides?.[TARGET_KEY]?.customPolygon).toBeUndefined()
  })
})
