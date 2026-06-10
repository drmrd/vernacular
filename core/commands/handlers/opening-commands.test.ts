import { describe, it, expect } from 'vitest'
import {
  placeOpening,
  moveOpening,
  resizeOpening,
  flipOpening,
  removeOpening,
  registerOpeningCommands,
  PLACE_OPENING,
  MOVE_OPENING,
  RESIZE_OPENING,
  FLIP_OPENING,
  REMOVE_OPENING,
} from './opening-commands'
import type { OpeningDimensions } from './opening-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor, createWall, createOpening } from '../../model/factories'
import type { Opening, Project } from '../../model/types'

const HOST_WALL_ID = 'wall-1'
const NEW_POSITION = 1500
const NEW_DIMENSIONS: OpeningDimensions = { width: 1626, height: 2100, sillHeight: 300 }

function newOpening(position = 1000): Opening {
  return createOpening({ type: 'single-swing-door', hostWallId: HOST_WALL_ID, position })
}

function projectWithTwoFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const hostWall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, { id: HOST_WALL_ID })
  project.floors = [
    createFloor('Ground', { id: 'g', walls: [hostWall] }),
    createFloor('Upper', { id: 'u' }),
  ]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerOpeningCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('placeOpening', () => {
  it('appends the opening to the target floor', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const opening = newOpening()

    dispatcher.dispatch(placeOpening('g', opening))

    expect(project.floors[0]?.openings).toEqual([opening])
  })

  it('leaves the sibling floor reference-equal', () => {
    const project = projectWithTwoFloors()
    const sibling = project.floors[1]
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(placeOpening('g', newOpening()))

    expect(project.floors[1]).toBe(sibling)
  })

  it('removes the appended opening on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(placeOpening('g', newOpening()))

    dispatcher.undo()

    expect(project.floors[0]?.openings).toEqual([])
  })

  it('carries a stable command type', () => {
    expect(placeOpening('g', newOpening()).type).toBe(PLACE_OPENING)
  })
})

describe('moveOpening', () => {
  it('sets the target opening position to the new value', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(moveOpening('g', target.id, NEW_POSITION))

    expect(project.floors[0]?.openings[0]?.position).toBe(NEW_POSITION)
  })

  it('leaves a sibling opening reference-equal', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const sibling = newOpening()
    dispatcher.dispatch(placeOpening('g', target))
    dispatcher.dispatch(placeOpening('g', sibling))

    dispatcher.dispatch(moveOpening('g', target.id, NEW_POSITION))

    expect(project.floors[0]?.openings[1]).toBe(sibling)
  })

  it('restores the previous position on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const originalPosition = target.position
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(moveOpening('g', target.id, NEW_POSITION))
    dispatcher.undo()

    expect(project.floors[0]?.openings[0]?.position).toBe(originalPosition)
  })

  it('carries a stable command type', () => {
    expect(moveOpening('g', 'opening-1', NEW_POSITION).type).toBe(MOVE_OPENING)
  })
})

describe('resizeOpening', () => {
  it('sets the width, height, and sill height together', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(resizeOpening('g', target.id, NEW_DIMENSIONS))

    const resized = project.floors[0]?.openings[0]
    expect(resized?.width).toBe(NEW_DIMENSIONS.width)
    expect(resized?.height).toBe(NEW_DIMENSIONS.height)
    expect(resized?.sillHeight).toBe(NEW_DIMENSIONS.sillHeight)
  })

  it('leaves a sibling opening reference-equal', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const sibling = newOpening()
    dispatcher.dispatch(placeOpening('g', target))
    dispatcher.dispatch(placeOpening('g', sibling))

    dispatcher.dispatch(resizeOpening('g', target.id, NEW_DIMENSIONS))

    expect(project.floors[0]?.openings[1]).toBe(sibling)
  })

  it('restores the previous dimensions on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(resizeOpening('g', target.id, NEW_DIMENSIONS))
    dispatcher.undo()

    const restored = project.floors[0]?.openings[0]
    expect(restored?.width).toBe(target.width)
    expect(restored?.height).toBe(target.height)
    expect(restored?.sillHeight).toBe(target.sillHeight)
  })

  it('carries a stable command type', () => {
    expect(resizeOpening('g', 'opening-1', NEW_DIMENSIONS).type).toBe(RESIZE_OPENING)
  })
})

describe('flipOpening', () => {
  it('toggles the hinge axis leaving facing unchanged', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const originalFacing = target.orientation.facing
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(flipOpening('g', target.id, 'hinge'))

    const flipped = project.floors[0]?.openings[0]
    expect(flipped?.orientation.hinge).toBe('end')
    expect(flipped?.orientation.facing).toBe(originalFacing)
  })

  it('toggles the facing axis leaving hinge unchanged', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const originalHinge = target.orientation.hinge
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(flipOpening('g', target.id, 'facing'))

    const flipped = project.floors[0]?.openings[0]
    expect(flipped?.orientation.facing).toBe('negative')
    expect(flipped?.orientation.hinge).toBe(originalHinge)
  })

  it('restores the previous orientation on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const originalOrientation = target.orientation
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(flipOpening('g', target.id, 'hinge'))
    dispatcher.undo()

    expect(project.floors[0]?.openings[0]?.orientation).toEqual(originalOrientation)
  })

  it('carries a stable command type', () => {
    expect(flipOpening('g', 'opening-1', 'hinge').type).toBe(FLIP_OPENING)
  })
})

describe('removeOpening', () => {
  it('filters the target opening out while a sibling remains', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const sibling = newOpening()
    dispatcher.dispatch(placeOpening('g', target))
    dispatcher.dispatch(placeOpening('g', sibling))

    dispatcher.dispatch(removeOpening('g', target.id))

    expect(project.floors[0]?.openings).toEqual([sibling])
  })

  it('restores the removed opening at its original index on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const first = newOpening()
    const middle = newOpening()
    const last = newOpening()
    dispatcher.dispatch(placeOpening('g', first))
    dispatcher.dispatch(placeOpening('g', middle))
    dispatcher.dispatch(placeOpening('g', last))

    dispatcher.dispatch(removeOpening('g', middle.id))
    dispatcher.undo()

    expect(project.floors[0]?.openings).toEqual([first, middle, last])
  })

  it('carries a stable command type', () => {
    expect(removeOpening('g', 'opening-1').type).toBe(REMOVE_OPENING)
  })
})
