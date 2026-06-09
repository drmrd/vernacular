import { describe, it, expect } from 'vitest'
import {
  translateEntities,
  rotateEntities,
  deleteEntities,
  pasteEntities,
  selectionCenter,
  registerTransformCommands,
  TRANSLATE_ENTITIES,
  ROTATE_ENTITIES,
  DELETE_ENTITIES,
  PASTE_ENTITIES,
} from './transform-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { buildClipboardSnapshot, instantiateClipboard } from '../../clipboard/clipboard'
import {
  createEmptyProject,
  createFloor,
  createWall,
  createOpening,
  createDimension,
} from '../../model/factories'
import type { Floor, Project } from '../../model/types'

const FLOOR_ID = 'g'
const FLOAT_TOLERANCE = 1e-9

function projectWithMixedEntities(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.0.0',
  })
  const w1 = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
  const w2 = createWall({ x: 0, y: 500 }, { x: 0, y: 1500 }, { id: 'w2' })
  const o1 = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w1',
    position: 500,
    id: 'o1',
  })
  const d1 = createDimension({ start: { x: 0, y: 0 }, end: { x: 300, y: 400 }, id: 'd1' })
  const floor = createFloor('Ground', { id: FLOOR_ID, walls: [w1, w2] })
  floor.openings = [o1]
  floor.dimensions = [d1]
  project.floors = [floor]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerTransformCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

function floorOf(project: Project): Floor {
  const floor = project.floors[0]
  if (floor === undefined) {
    throw new Error('expected a ground floor')
  }
  return floor
}

describe('translateEntities', () => {
  it('moves the endpoints of every selected wall and dimension by the delta', () => {
    const project = projectWithMixedEntities()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(translateEntities(FLOOR_ID, ['w1', 'd1'], { x: 50, y: 0 }))

    const floor = floorOf(project)
    expect(floor.walls[0]?.start).toEqual({ x: 50, y: 0 })
    expect(floor.walls[0]?.end).toEqual({ x: 1050, y: 0 })
    expect(floor.dimensions[0]?.start).toEqual({ x: 50, y: 0 })
    expect(floor.dimensions[0]?.end).toEqual({ x: 350, y: 400 })
  })

  it('leaves an unselected wall reference-equal', () => {
    const project = projectWithMixedEntities()
    const unselected = floorOf(project).walls[1]
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(translateEntities(FLOOR_ID, ['w1', 'd1'], { x: 50, y: 0 }))

    expect(floorOf(project).walls[1]).toBe(unselected)
  })

  it('leaves a hosted opening reference-equal', () => {
    const project = projectWithMixedEntities()
    const opening = floorOf(project).openings[0]
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(translateEntities(FLOOR_ID, ['w1', 'd1'], { x: 50, y: 0 }))

    expect(floorOf(project).openings[0]).toBe(opening)
  })

  it('restores the original floor on undo', () => {
    const project = projectWithMixedEntities()
    const before = structuredClone(floorOf(project))
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(translateEntities(FLOOR_ID, ['w1', 'd1'], { x: 50, y: 0 }))
    dispatcher.undo()

    expect(floorOf(project)).toEqual(before)
  })

  it('carries a stable command type', () => {
    expect(translateEntities(FLOOR_ID, ['w1'], { x: 0, y: 0 }).type).toBe(TRANSLATE_ENTITIES)
  })
})

describe('rotateEntities', () => {
  it('rotates the selected wall endpoints about the pivot', () => {
    const project = projectWithMixedEntities()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(rotateEntities(FLOOR_ID, ['w1'], { x: 0, y: 0 }, Math.PI / 2))

    const rotated = floorOf(project).walls[0]
    expect(rotated?.start.x).toBeCloseTo(0)
    expect(rotated?.start.y).toBeCloseTo(0)
    expect(rotated?.end.x).toBeCloseTo(0)
    expect(rotated?.end.y).toBeCloseTo(1000)
  })

  it('leaves an unselected dimension reference-equal', () => {
    const project = projectWithMixedEntities()
    const dimension = floorOf(project).dimensions[0]
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(rotateEntities(FLOOR_ID, ['w1'], { x: 0, y: 0 }, Math.PI / 2))

    expect(floorOf(project).dimensions[0]).toBe(dimension)
  })

  it('restores the original floor on undo', () => {
    const project = projectWithMixedEntities()
    const before = structuredClone(floorOf(project))
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(rotateEntities(FLOOR_ID, ['w1'], { x: 0, y: 0 }, Math.PI / 2))
    dispatcher.undo()

    const after = floorOf(project)
    expect(after.walls[0]?.start.x).toBeCloseTo(before.walls[0]?.start.x ?? NaN, FLOAT_TOLERANCE)
    expect(after.walls[0]?.end.x).toBeCloseTo(before.walls[0]?.end.x ?? NaN, FLOAT_TOLERANCE)
    expect(after.walls[0]?.end.y).toBeCloseTo(before.walls[0]?.end.y ?? NaN, FLOAT_TOLERANCE)
  })

  it('carries a stable command type', () => {
    expect(rotateEntities(FLOOR_ID, ['w1'], { x: 0, y: 0 }, Math.PI / 2).type).toBe(ROTATE_ENTITIES)
  })
})

describe('deleteEntities', () => {
  it('removes a wall and cascades to openings hosted on it, keeping the other wall and dimension', () => {
    const project = projectWithMixedEntities()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(deleteEntities(FLOOR_ID, ['w1']))

    const floor = floorOf(project)
    expect(floor.walls.map((wall) => wall.id)).toEqual(['w2'])
    expect(floor.openings.map((opening) => opening.id)).toEqual([])
    expect(floor.dimensions.map((dimension) => dimension.id)).toEqual(['d1'])
  })

  it('restores the deleted wall and its hosted opening on undo', () => {
    const project = projectWithMixedEntities()
    const before = structuredClone(floorOf(project))
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(deleteEntities(FLOOR_ID, ['w1']))
    dispatcher.undo()

    expect(floorOf(project)).toEqual(before)
  })

  it('removes only the named opening and dimension, leaving both walls', () => {
    const project = projectWithMixedEntities()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(deleteEntities(FLOOR_ID, ['o1', 'd1']))

    const floor = floorOf(project)
    expect(floor.walls.map((wall) => wall.id)).toEqual(['w1', 'w2'])
    expect(floor.openings.map((opening) => opening.id)).toEqual([])
    expect(floor.dimensions.map((dimension) => dimension.id)).toEqual([])
  })

  it('restores the deleted opening and dimension on undo', () => {
    const project = projectWithMixedEntities()
    const before = structuredClone(floorOf(project))
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(deleteEntities(FLOOR_ID, ['o1', 'd1']))
    dispatcher.undo()

    expect(floorOf(project)).toEqual(before)
  })

  it('carries a stable command type', () => {
    expect(deleteEntities(FLOOR_ID, ['w1']).type).toBe(DELETE_ENTITIES)
  })
})

function sequentialMintId(): () => string {
  let next = 0
  return () => {
    next += 1
    return `paste-${String(next)}`
  }
}

describe('pasteEntities', () => {
  function projectWithSiblingFloor(): Project {
    const project = projectWithMixedEntities()
    project.floors = [...project.floors, createFloor('Upper', { id: 'upper' })]
    return project
  }

  function instantiatedFor(floor: Floor) {
    const snapshot = buildClipboardSnapshot(floor, ['w1', 'd1'])
    return instantiateClipboard(snapshot, { x: 100, y: 0 }, sequentialMintId())
  }

  it('appends exactly the instantiated walls, openings, and dimensions to the floor', () => {
    const project = projectWithSiblingFloor()
    const dispatcher = dispatcherFor(project)
    const instantiated = instantiatedFor(floorOf(project))

    dispatcher.dispatch(pasteEntities(FLOOR_ID, instantiated))

    const floor = floorOf(project)
    expect(floor.walls).toHaveLength(3)
    expect(floor.walls[2]).toBe(instantiated.walls[0])
    expect(floor.openings).toHaveLength(2)
    expect(floor.openings[1]).toBe(instantiated.openings[0])
    expect(floor.dimensions).toHaveLength(2)
    expect(floor.dimensions[1]).toBe(instantiated.dimensions[0])
  })

  it('keeps the original wall, opening, and dimension at the front of each list', () => {
    const project = projectWithSiblingFloor()
    const dispatcher = dispatcherFor(project)
    const instantiated = instantiatedFor(floorOf(project))

    dispatcher.dispatch(pasteEntities(FLOOR_ID, instantiated))

    const floor = floorOf(project)
    expect(floor.walls[0]?.id).toBe('w1')
    expect(floor.openings[0]?.id).toBe('o1')
    expect(floor.dimensions[0]?.id).toBe('d1')
  })

  it('leaves a sibling floor reference-equal', () => {
    const project = projectWithSiblingFloor()
    const sibling = project.floors[1]
    const dispatcher = dispatcherFor(project)
    const instantiated = instantiatedFor(floorOf(project))

    dispatcher.dispatch(pasteEntities(FLOOR_ID, instantiated))

    expect(project.floors[1]).toBe(sibling)
  })

  it('removes exactly the pasted entities on undo', () => {
    const project = projectWithSiblingFloor()
    const before = structuredClone(floorOf(project))
    const dispatcher = dispatcherFor(project)
    const instantiated = instantiatedFor(floorOf(project))

    dispatcher.dispatch(pasteEntities(FLOOR_ID, instantiated))
    dispatcher.undo()

    expect(floorOf(project)).toEqual(before)
  })

  it('carries a stable command type', () => {
    const project = projectWithSiblingFloor()
    const instantiated = instantiatedFor(floorOf(project))

    expect(pasteEntities(FLOOR_ID, instantiated).type).toBe(PASTE_ENTITIES)
  })
})

describe('selectionCenter', () => {
  it('returns the midpoint of the selected entity bounding box', () => {
    const floor = floorOf(projectWithMixedEntities())

    expect(selectionCenter(floor, ['w1'])).toEqual({ x: 500, y: 0 })
  })

  it('returns the origin for an empty selection', () => {
    const floor = floorOf(projectWithMixedEntities())

    expect(selectionCenter(floor, [])).toEqual({ x: 0, y: 0 })
  })
})
