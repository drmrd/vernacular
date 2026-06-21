import { describe, it, expect } from 'vitest'
import {
  placeOpening,
  moveOpening,
  resizeOpening,
  resizeOpeningEdge,
  flipOpening,
  removeOpening,
  setOpeningType,
  registerOpeningCommands,
  PLACE_OPENING,
  MOVE_OPENING,
  RESIZE_OPENING,
  RESIZE_OPENING_EDGE,
  FLIP_OPENING,
  REMOVE_OPENING,
} from './opening-commands'
import type { OpeningDimensions } from './opening-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor, createWall, createOpening } from '../../model/factories'
import { InvalidLengthError, MAX_LENGTH_MM } from '../../index'
import type { Opening, Project } from '../../model/types'

const HOST_WALL_ID = 'wall-1'
const NEW_POSITION = 1500
const NEW_DIMENSIONS: OpeningDimensions = { width: 1626, height: 2100, sillHeight: 300 }
const NEW_EDGE_WIDTH = 1626
const NEW_EDGE_POSITION = 1500

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

  it('rejects a non-positive or absurd width or height but allows a zero sill height', () => {
    const rejectedDimensions: OpeningDimensions[] = [
      { width: 0, height: 2100, sillHeight: 300 },
      { width: -5, height: 2100, sillHeight: 300 },
      { width: 1626, height: -10, sillHeight: 300 },
      { width: MAX_LENGTH_MM + 1, height: 2100, sillHeight: 300 },
      { width: 1626, height: 2100, sillHeight: -1 },
      { width: 1626, height: 2100, sillHeight: MAX_LENGTH_MM + 1 },
    ]

    for (const rejected of rejectedDimensions) {
      const project = projectWithTwoFloors()
      const dispatcher = dispatcherFor(project)
      const target = newOpening()
      const originalWidth = target.width
      const originalHeight = target.height
      const originalSillHeight = target.sillHeight
      dispatcher.dispatch(placeOpening('g', target))

      let thrown: unknown
      expect(() => {
        try {
          dispatcher.dispatch(resizeOpening('g', target.id, rejected))
        } catch (error) {
          thrown = error
          throw error
        }
      }).toThrow(/rolled back/)
      expect((thrown as Error).cause).toBeInstanceOf(InvalidLengthError)

      const unchanged = project.floors[0]?.openings[0]
      expect(unchanged?.width).toBe(originalWidth)
      expect(unchanged?.height).toBe(originalHeight)
      expect(unchanged?.sillHeight).toBe(originalSillHeight)
    }

    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(resizeOpening('g', target.id, { width: 900, height: 2100, sillHeight: 0 }))

    const floorMounted = project.floors[0]?.openings[0]
    expect(floorMounted?.width).toBe(900)
    expect(floorMounted?.height).toBe(2100)
    expect(floorMounted?.sillHeight).toBe(0)
  })
})

describe('resizeOpeningEdge', () => {
  it('sets the target opening width and position to the new values', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(resizeOpeningEdge('g', target.id, NEW_EDGE_WIDTH, NEW_EDGE_POSITION))

    const resized = project.floors[0]?.openings[0]
    expect(resized?.width).toBe(NEW_EDGE_WIDTH)
    expect(resized?.position).toBe(NEW_EDGE_POSITION)
  })

  it('preserves the opening height and sill height', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const originalHeight = target.height
    const originalSillHeight = target.sillHeight
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(resizeOpeningEdge('g', target.id, NEW_EDGE_WIDTH, NEW_EDGE_POSITION))

    const resized = project.floors[0]?.openings[0]
    expect(resized?.height).toBe(originalHeight)
    expect(resized?.sillHeight).toBe(originalSillHeight)
  })

  it('leaves the sibling floor reference-equal', () => {
    const project = projectWithTwoFloors()
    const sibling = project.floors[1]
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(resizeOpeningEdge('g', target.id, NEW_EDGE_WIDTH, NEW_EDGE_POSITION))

    expect(project.floors[1]).toBe(sibling)
  })

  it('restores the previous width and position on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newOpening()
    const originalWidth = target.width
    const originalPosition = target.position
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(resizeOpeningEdge('g', target.id, NEW_EDGE_WIDTH, NEW_EDGE_POSITION))
    dispatcher.undo()

    const restored = project.floors[0]?.openings[0]
    expect(restored?.width).toBe(originalWidth)
    expect(restored?.position).toBe(originalPosition)
  })

  it('carries a stable command type', () => {
    expect(resizeOpeningEdge('g', 'x', 900, 1000).type).toBe(RESIZE_OPENING_EDGE)
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

describe('setOpeningType', () => {
  it('changes only the opening type and preserves every other field', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = createOpening({
      type: 'single-swing-door',
      hostWallId: HOST_WALL_ID,
      position: 1200,
      width: 900,
      height: 2100,
      sillHeight: 0,
    })
    dispatcher.dispatch(placeOpening('g', target))

    dispatcher.dispatch(setOpeningType('g', target.id, 'double-swing-door'))

    const retyped = project.floors[0]?.openings[0]
    expect(retyped?.type).toBe('double-swing-door')
    expect(retyped?.hostWallId).toBe(target.hostWallId)
    expect(retyped?.position).toBe(target.position)
    expect(retyped?.width).toBe(target.width)
    expect(retyped?.height).toBe(target.height)
    expect(retyped?.sillHeight).toBe(target.sillHeight)
    expect(retyped?.orientation).toEqual(target.orientation)
  })
})
