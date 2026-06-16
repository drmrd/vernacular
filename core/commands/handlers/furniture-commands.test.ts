import { describe, it, expect } from 'vitest'
import {
  placeFurniture,
  moveFurniture,
  rotateFurniture,
  resizeFurniture,
  setFurnitureName,
  removeFurniture,
  registerFurnitureCommands,
  PLACE_FURNITURE,
  MOVE_FURNITURE,
  ROTATE_FURNITURE,
  RESIZE_FURNITURE,
  SET_FURNITURE_NAME,
  REMOVE_FURNITURE,
} from './furniture-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor, createFurnitureInstance } from '../../model/factories'
import type { FurnitureInstance, FurnitureFootprint, Project } from '../../model/types'

function furnitureFixture(id = 'fu-1'): FurnitureInstance {
  return createFurnitureInstance({
    assetRef: { scope: 'user', contentHash: 'hash-1' },
    position: { x: 100, y: 200 },
    footprint: { width: 600, depth: 600 },
    id,
  })
}

function projectWithTwoFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' }), createFloor('Upper', { id: 'u' })]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerFurnitureCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('placeFurniture', () => {
  it('carries a stable command type', () => {
    expect(PLACE_FURNITURE).toBe('floor/place-furniture')
    expect(placeFurniture('g', furnitureFixture()).type).toBe(PLACE_FURNITURE)
  })

  it('appends the instance to the target floor furniture array', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()

    dispatcher.dispatch(placeFurniture('g', instance))

    expect(project.floors[0]?.furniture).toEqual([instance])
  })

  it('leaves the sibling floor furniture unchanged', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(placeFurniture('g', furnitureFixture()))

    expect(project.floors[1]?.furniture).toEqual([])
  })

  it('removes the appended instance on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(placeFurniture('g', furnitureFixture()))

    dispatcher.undo()

    expect(project.floors[0]?.furniture).toEqual([])
  })
})

describe('moveFurniture', () => {
  const NEW_POSITION = { x: 500, y: 750 }

  it('carries a stable command type', () => {
    expect(MOVE_FURNITURE).toBe('floor/move-furniture')
    expect(moveFurniture('g', 'fu-1', NEW_POSITION).type).toBe(MOVE_FURNITURE)
  })

  it('sets the position on the target instance', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    dispatcher.dispatch(placeFurniture('g', instance))

    dispatcher.dispatch(moveFurniture('g', instance.id, NEW_POSITION))

    expect(project.floors[0]?.furniture[0]?.position).toEqual(NEW_POSITION)
  })

  it('leaves a sibling instance reference-equal', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = furnitureFixture('fu-1')
    const sibling = furnitureFixture('fu-2')
    dispatcher.dispatch(placeFurniture('g', target))
    dispatcher.dispatch(placeFurniture('g', sibling))

    dispatcher.dispatch(moveFurniture('g', target.id, NEW_POSITION))

    expect(project.floors[0]?.furniture[1]).toBe(sibling)
  })

  it('restores the previous position on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    const originalPosition = instance.position
    dispatcher.dispatch(placeFurniture('g', instance))

    dispatcher.dispatch(moveFurniture('g', instance.id, NEW_POSITION))
    dispatcher.undo()

    expect(project.floors[0]?.furniture[0]?.position).toEqual(originalPosition)
  })
})

describe('rotateFurniture', () => {
  const NEW_ROTATION = 45

  it('carries a stable command type', () => {
    expect(ROTATE_FURNITURE).toBe('floor/rotate-furniture')
    expect(rotateFurniture('g', 'fu-1', NEW_ROTATION).type).toBe(ROTATE_FURNITURE)
  })

  it('sets the rotation on the target instance', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    dispatcher.dispatch(placeFurniture('g', instance))

    dispatcher.dispatch(rotateFurniture('g', instance.id, NEW_ROTATION))

    expect(project.floors[0]?.furniture[0]?.rotation).toBe(NEW_ROTATION)
  })

  it('leaves a sibling instance reference-equal', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = furnitureFixture('fu-1')
    const sibling = furnitureFixture('fu-2')
    dispatcher.dispatch(placeFurniture('g', target))
    dispatcher.dispatch(placeFurniture('g', sibling))

    dispatcher.dispatch(rotateFurniture('g', target.id, NEW_ROTATION))

    expect(project.floors[0]?.furniture[1]).toBe(sibling)
  })

  it('restores the previous rotation on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    const originalRotation = instance.rotation
    dispatcher.dispatch(placeFurniture('g', instance))

    dispatcher.dispatch(rotateFurniture('g', instance.id, NEW_ROTATION))
    dispatcher.undo()

    expect(project.floors[0]?.furniture[0]?.rotation).toBe(originalRotation)
  })
})

describe('resizeFurniture', () => {
  const NEW_FOOTPRINT: FurnitureFootprint = { width: 800, depth: 400 }

  it('carries a stable command type', () => {
    expect(RESIZE_FURNITURE).toBe('floor/resize-furniture')
    expect(resizeFurniture('g', 'fu-1', NEW_FOOTPRINT).type).toBe(RESIZE_FURNITURE)
  })

  it('replaces the footprint on the target instance', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    dispatcher.dispatch(placeFurniture('g', instance))

    dispatcher.dispatch(resizeFurniture('g', instance.id, NEW_FOOTPRINT))

    expect(project.floors[0]?.furniture[0]?.footprint).toEqual(NEW_FOOTPRINT)
  })

  it('leaves a sibling instance reference-equal', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = furnitureFixture('fu-1')
    const sibling = furnitureFixture('fu-2')
    dispatcher.dispatch(placeFurniture('g', target))
    dispatcher.dispatch(placeFurniture('g', sibling))

    dispatcher.dispatch(resizeFurniture('g', target.id, NEW_FOOTPRINT))

    expect(project.floors[0]?.furniture[1]).toBe(sibling)
  })

  it('restores the previous footprint on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    const originalFootprint = instance.footprint
    dispatcher.dispatch(placeFurniture('g', instance))

    dispatcher.dispatch(resizeFurniture('g', instance.id, NEW_FOOTPRINT))
    dispatcher.undo()

    expect(project.floors[0]?.furniture[0]?.footprint).toEqual(originalFootprint)
  })
})

describe('setFurnitureName', () => {
  const NEW_NAME = 'Armchair'

  it('carries a stable command type', () => {
    expect(SET_FURNITURE_NAME).toBe('floor/set-furniture-name')
    expect(setFurnitureName('g', 'fu-1', NEW_NAME).type).toBe(SET_FURNITURE_NAME)
  })

  it('sets the name on the target instance', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    dispatcher.dispatch(placeFurniture('g', instance))

    dispatcher.dispatch(setFurnitureName('g', instance.id, NEW_NAME))

    expect(project.floors[0]?.furniture[0]?.name).toBe(NEW_NAME)
  })

  it('clears the name when an empty string is dispatched', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    dispatcher.dispatch(placeFurniture('g', instance))
    dispatcher.dispatch(setFurnitureName('g', instance.id, NEW_NAME))

    dispatcher.dispatch(setFurnitureName('g', instance.id, ''))

    const result = project.floors[0]?.furniture[0]
    expect(result !== undefined && 'name' in result).toBe(false)
  })

  it('restores the previous name on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const instance = furnitureFixture()
    dispatcher.dispatch(placeFurniture('g', instance))
    dispatcher.dispatch(setFurnitureName('g', instance.id, 'Initial'))

    dispatcher.dispatch(setFurnitureName('g', instance.id, NEW_NAME))
    dispatcher.undo()

    expect(project.floors[0]?.furniture[0]?.name).toBe('Initial')
  })
})

describe('removeFurniture', () => {
  it('carries a stable command type', () => {
    expect(REMOVE_FURNITURE).toBe('floor/remove-furniture')
    expect(removeFurniture('g', 'fu-1').type).toBe(REMOVE_FURNITURE)
  })

  it('filters the target instance out while a sibling remains', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = furnitureFixture('fu-1')
    const sibling = furnitureFixture('fu-2')
    dispatcher.dispatch(placeFurniture('g', target))
    dispatcher.dispatch(placeFurniture('g', sibling))

    dispatcher.dispatch(removeFurniture('g', target.id))

    expect(project.floors[0]?.furniture).toEqual([sibling])
  })

  it('restores the removed instance at its original index on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const first = furnitureFixture('fu-1')
    const middle = furnitureFixture('fu-2')
    const last = furnitureFixture('fu-3')
    dispatcher.dispatch(placeFurniture('g', first))
    dispatcher.dispatch(placeFurniture('g', middle))
    dispatcher.dispatch(placeFurniture('g', last))

    dispatcher.dispatch(removeFurniture('g', middle.id))
    dispatcher.undo()

    expect(project.floors[0]?.furniture).toEqual([first, middle, last])
  })
})
