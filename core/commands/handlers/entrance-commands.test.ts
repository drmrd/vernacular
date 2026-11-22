import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor, createOpening, createWall } from '../../model/factories'
import type { Opening, Project } from '../../model/types'
import {
  CLEAR_MAIN_ENTRANCE,
  MARK_MAIN_ENTRANCE,
  clearMainEntrance,
  markMainEntrance,
  registerEntranceCommands,
} from './entrance-commands'
import { registerAllProjectCommands } from './register-all-project-commands'

const HOST_WALL_ID = 'wall-1'
const GROUND_ID = 'g'
const UPPER_ID = 'u'
const WALL_LENGTH = 6000
const FIRST_POSITION = 1000
const SECOND_POSITION = 3000
const THIRD_POSITION = 5000

function opening(id: string, position: number, type = 'single-swing-door'): Opening {
  return createOpening({ type, hostWallId: HOST_WALL_ID, position, id })
}

function markedDoor(id: string, position: number): Opening {
  return { ...opening(id, position), entrance: true }
}

/** Two doors on the ground floor and one on the upper floor, with a mark on the first and third. */
function projectWithTwoMarks(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH, y: 0 }, { id: HOST_WALL_ID })
  project.floors = [
    {
      ...createFloor('Ground', { id: GROUND_ID, walls: [wall] }),
      openings: [
        markedDoor('front', FIRST_POSITION),
        opening('back', SECOND_POSITION),
        opening('window', THIRD_POSITION, 'double-hung-window'),
      ],
    },
    {
      ...createFloor('Upper', { id: UPPER_ID }),
      openings: [markedDoor('upstairs', FIRST_POSITION)],
    },
  ]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  return new Dispatcher(project, registerAllProjectCommands(new CommandRegistry<Project>()))
}

function allOpenings(project: Project): Opening[] {
  return project.floors.flatMap((floor) => floor.openings)
}

function markedIds(project: Project): string[] {
  return allOpenings(project)
    .filter((candidate) => candidate.entrance === true)
    .map((candidate) => candidate.id)
}

describe('markMainEntrance', () => {
  it('marks the named door and removes the mark from every other opening on every floor', () => {
    const project = projectWithTwoMarks()

    dispatcherFor(project).dispatch(markMainEntrance(GROUND_ID, 'back'))

    expect(markedIds(project)).toEqual(['back'])
    for (const candidate of allOpenings(project).filter((each) => each.id !== 'back')) {
      expect('entrance' in candidate).toBe(false)
    }
  })

  it('restores the earlier marks exactly on one undo', () => {
    const project = projectWithTwoMarks()
    const before = structuredClone(project.floors)
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(markMainEntrance(GROUND_ID, 'back'))

    dispatcher.undo()

    expect(project.floors).toEqual(before)
  })

  it('applies the mark again on one redo', () => {
    const project = projectWithTwoMarks()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(markMainEntrance(GROUND_ID, 'back'))
    dispatcher.undo()

    dispatcher.redo()

    expect(markedIds(project)).toEqual(['back'])
  })

  it('reassigns floors to a new array for a real change', () => {
    const project = projectWithTwoMarks()
    const floorsBefore = project.floors

    dispatcherFor(project).dispatch(markMainEntrance(GROUND_ID, 'back'))

    expect(project.floors).not.toBe(floorsBefore)
  })

  it.each([
    ['a missing opening id', GROUND_ID, 'no-such-opening'],
    ['an opening on another floor id', UPPER_ID, 'back'],
    ['a window', GROUND_ID, 'window'],
  ])('changes nothing for %s', (_label, floorId, openingId) => {
    const project = projectWithTwoMarks()
    const before = structuredClone(project)

    dispatcherFor(project).dispatch(markMainEntrance(floorId, openingId))

    expect(project).toEqual(before)
  })

  it('carries a stable command type and description', () => {
    const command = markMainEntrance(GROUND_ID, 'back')

    expect(command.type).toBe(MARK_MAIN_ENTRANCE)
    expect(command.description).toBe('Mark main entrance')
  })
})

describe('clearMainEntrance', () => {
  it('removes the entrance key from every opening, not set to false', () => {
    const project = projectWithTwoMarks()

    dispatcherFor(project).dispatch(clearMainEntrance())

    for (const candidate of allOpenings(project)) {
      expect('entrance' in candidate).toBe(false)
    }
  })

  it('brings the mark back on undo', () => {
    const project = projectWithTwoMarks()
    const before = structuredClone(project.floors)
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(clearMainEntrance())

    dispatcher.undo()

    expect(project.floors).toEqual(before)
  })

  it('reassigns floors to a new array for a real change', () => {
    const project = projectWithTwoMarks()
    const floorsBefore = project.floors

    dispatcherFor(project).dispatch(clearMainEntrance())

    expect(project.floors).not.toBe(floorsBefore)
  })

  it('carries a stable command type and description', () => {
    const command = clearMainEntrance()

    expect(command.type).toBe(CLEAR_MAIN_ENTRANCE)
    expect(command.description).toBe('Clear main entrance')
  })
})

describe('registerEntranceCommands', () => {
  it('registers the mark and clear commands', () => {
    const registry = registerEntranceCommands(new CommandRegistry<Project>())

    expect(registry.handlerFor(MARK_MAIN_ENTRANCE)).toBeDefined()
    expect(registry.handlerFor(CLEAR_MAIN_ENTRANCE)).toBeDefined()
  })
})
