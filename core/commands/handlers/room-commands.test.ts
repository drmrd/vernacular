import { describe, it, expect } from 'vitest'
import { setRoomName, setRoomCustomPolygon, registerRoomCommands } from './room-commands'
import { setRoomPeriod, setRoomPurpose, setRoomStyle, setRoomSubPurpose } from './room-commands'
import { setRoomCeilingHeight } from './room-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import type { Point } from '../../index'
import { InvalidLengthError } from '../../index'
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

describe('setRoomPurpose', () => {
  it('tags a room with a purpose while preserving an existing name and leaving sub-purpose absent', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Kitchen'))

    dispatcher.dispatch(setRoomPurpose(TARGET_KEY, 'kitchen'))

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Kitchen')
    expect(project.roomOverrides?.[TARGET_KEY]?.purpose).toBe('kitchen')
    expect(project.roomOverrides?.[TARGET_KEY]?.subPurpose).toBeUndefined()
  })

  it('restores absent overrides on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomPurpose(TARGET_KEY, 'kitchen'))

    dispatcher.undo()

    expect(project.roomOverrides).toBeUndefined()
  })
})

describe('setRoomSubPurpose', () => {
  it('records an optional free-text sub-purpose and clears it on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomPurpose(TARGET_KEY, 'butlers-pantry'))

    dispatcher.dispatch(setRoomSubPurpose(TARGET_KEY, 'Silver Pantry'))
    expect(project.roomOverrides?.[TARGET_KEY]?.subPurpose).toBe('Silver Pantry')

    dispatcher.undo()
    expect(project.roomOverrides?.[TARGET_KEY]?.subPurpose).toBeUndefined()
    expect(project.roomOverrides?.[TARGET_KEY]?.purpose).toBe('butlers-pantry')
  })
})

describe('setRoomPeriod', () => {
  it('overrides a room period and restores the prior value on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomPeriod(TARGET_KEY, 'edwardian'))
    expect(project.roomOverrides?.[TARGET_KEY]?.periodOverride).toBe('edwardian')

    dispatcher.undo()

    expect(project.roomOverrides).toBeUndefined()
  })
})

describe('setRoomCeilingHeight', () => {
  const CEILING_HEIGHT_MM = 2700

  it('records a per-room ceiling height and clears it on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomCeilingHeight(TARGET_KEY, CEILING_HEIGHT_MM))
    expect(project.roomOverrides?.[TARGET_KEY]?.ceilingHeight).toBe(CEILING_HEIGHT_MM)

    dispatcher.undo()

    expect(project.roomOverrides?.[TARGET_KEY]?.ceilingHeight).toBeUndefined()
  })

  it('clears the override when set to undefined', () => {
    const project = newProject()
    project.roomOverrides = { [TARGET_KEY]: { ceilingHeight: CEILING_HEIGHT_MM } }
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomCeilingHeight(TARGET_KEY, undefined))

    expect(project.roomOverrides?.[TARGET_KEY]?.ceilingHeight).toBeUndefined()
  })

  it('rejects a non-positive ceiling height but still allows undefined to clear the override', () => {
    const rejectedHeights = [0, -100]

    for (const rejected of rejectedHeights) {
      const project = newProject()
      project.roomOverrides = { [TARGET_KEY]: { ceilingHeight: CEILING_HEIGHT_MM } }
      const dispatcher = dispatcherFor(project)

      let thrown: unknown
      expect(() => {
        try {
          dispatcher.dispatch(setRoomCeilingHeight(TARGET_KEY, rejected))
        } catch (error) {
          thrown = error
          throw error
        }
      }).toThrow(/rolled back/)
      expect((thrown as Error).cause).toBeInstanceOf(InvalidLengthError)

      expect(project.roomOverrides?.[TARGET_KEY]?.ceilingHeight).toBe(CEILING_HEIGHT_MM)
    }

    const project = newProject()
    project.roomOverrides = { [TARGET_KEY]: { ceilingHeight: CEILING_HEIGHT_MM } }
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomCeilingHeight(TARGET_KEY, undefined))

    expect(project.roomOverrides?.[TARGET_KEY]?.ceilingHeight).toBeUndefined()
  })
})

describe('setRoomStyle', () => {
  it('tags a room with a style and the vernacular modifier', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomStyle(TARGET_KEY, { styleId: 'italianate', vernacular: true }))

    expect(project.roomOverrides?.[TARGET_KEY]?.styleOverride).toEqual({
      styleId: 'italianate',
      vernacular: true,
    })
  })
})
