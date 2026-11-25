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
  createOpening,
  createWall,
  DEFAULT_WALL_THICKNESS_MM,
} from '../../model/factories'
import { colorFromHex } from '../../color/color'
import { solidTreatment, surfaceKey } from '../../model/paint'
import type { Project } from '../../model/types'
import { MAX_LENGTH_MM, InvalidLengthError } from '../../index'

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

function wallSegment(fromX: number, toX: number, y = 0) {
  return { start: { x: fromX, y }, end: { x: toX, y } }
}

function projectWithFinishedWall(): Project {
  const project = projectWithFloor()
  const ground = project.floors[0]!
  const hostId = 'host'
  const { start, end } = wallSegment(0, 4000)
  ground.walls = [
    {
      ...createWall(start, end, { id: hostId, thickness: 250 }),
      constructionProfile: 'solid-masonry-brick',
    },
  ]
  ground.openings = [
    createOpening({ id: 'door', hostWallId: hostId, type: 'single-swing-door', position: 2000 }),
  ]
  project.paint = {
    [surfaceKey({ kind: 'wall-face', wallId: hostId, side: 'left' })]: solidTreatment(
      colorFromHex('#9aa583'),
      'satin',
    ),
  }
  project.floors.push(
    createFloor('Upper', {
      id: 'u',
      walls: [createWall(start, end, { id: 'upper-wall' })],
    }),
  )
  return project
}

describe('addWall', () => {
  it('adds only the exposed pieces of a stroke in one undoable draw', () => {
    const cases = [
      {
        label: 'one exposed piece',
        stroke: wallSegment(1000, 5000),
        expected: [wallSegment(4000, 5000)],
      },
      {
        label: 'two pieces drawn in reverse',
        stroke: wallSegment(6000, -1000),
        expected: [wallSegment(6000, 4000), wallSegment(0, -1000)],
      },
      {
        label: 'entirely covered',
        stroke: wallSegment(1000, 3000),
        expected: [],
      },
      {
        label: 'unobstructed draw',
        stroke: wallSegment(1000, 5000, 2000),
        expected: [wallSegment(1000, 5000, 2000)],
      },
    ]

    for (const { label, stroke, expected } of cases) {
      const project = projectWithFinishedWall()
      const before = structuredClone(project)
      const upper = project.floors[1]
      const dispatcher = dispatcherFor(project)
      const command = addWall('g', stroke.start, stroke.end)

      dispatcher.dispatch(command)

      const ground = project.floors[0]!
      const added = ground.walls.slice(1)
      expect
        .soft(
          added.map(({ start, end }) => ({ start, end })),
          label,
        )
        .toEqual(expected)
      expect.soft(ground.walls[0], label).toEqual(before.floors[0]?.walls[0])
      expect.soft(ground.openings, label).toEqual(before.floors[0]?.openings)
      expect.soft(project.paint, label).toEqual(before.paint)
      expect.soft(project.floors[1], label).toBe(upper)
      expect.soft(project.floors[1], label).toEqual(before.floors[1])

      if (expected.length === 0) {
        expect.soft(project, label).toEqual(before)
        continue
      }

      expect.soft(added[0]?.id, label).toBe(command.params.wall.id)
      const wallIds = project.floors.flatMap((floor) => floor.walls.map((wall) => wall.id))
      expect.soft(new Set(wallIds).size, label).toBe(wallIds.length)

      const after = structuredClone(project)
      expect.soft(dispatcher.undo(), label).toBe(true)
      expect.soft(project, label).toEqual(before)
      expect.soft(dispatcher.canUndo(), label).toBe(false)
      expect.soft(dispatcher.redo(), label).toBe(true)
      expect.soft(project, label).toEqual(after)

      const replay = structuredClone(before)
      dispatcherFor(replay).dispatch(command)
      expect.soft(replay, label).toEqual(after)
    }
  })

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

  it('rejects a non-positive or absurdly large thickness and leaves the wall unchanged', () => {
    const rejectedThicknesses = [-5, 0, MAX_LENGTH_MM + 1]

    for (const rejected of rejectedThicknesses) {
      const project = projectWithTwoWalls()
      const dispatcher = dispatcherFor(project)

      let thrown: unknown
      expect(() => {
        try {
          dispatcher.dispatch(setWallThickness('g', 'target', rejected))
        } catch (error) {
          thrown = error
          throw error
        }
      }).toThrow(/rolled back/)
      expect((thrown as Error).cause).toBeInstanceOf(InvalidLengthError)

      expect(project.floors[0]!.walls[0]!.thickness).toBe(TARGET_THICKNESS)
    }
  })
})
