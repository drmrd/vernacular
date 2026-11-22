import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor, createOpening, createWall } from '../../model/factories'
import type { InstantiatedEntities } from '../../clipboard/clipboard'
import type { Floor, Opening, Project } from '../../model/types'
import { addFloor, placeOpening, pasteEntities, setOpeningType } from '../../index'
import { registerAllProjectCommands } from './register-all-project-commands'

const FLOOR_ID = 'g'
const HOST_WALL_ID = 'wall-1'
const WALL_LENGTH = 6000
const DOOR_POSITION = 1000
const PASTE_POSITION = 3000

function door(id: string, position: number, type = 'single-swing-door'): Opening {
  return createOpening({ type, hostWallId: HOST_WALL_ID, position, id })
}

function markedDoor(id: string, position: number, type = 'single-swing-door'): Opening {
  return { ...door(id, position, type), entrance: true }
}

function projectWithMarkedDoor(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH, y: 0 }, { id: HOST_WALL_ID })
  project.floors = [
    {
      ...createFloor('Ground', { id: FLOOR_ID, walls: [wall] }),
      openings: [markedDoor('front', DOOR_POSITION)],
    },
  ]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  return new Dispatcher(project, registerAllProjectCommands(new CommandRegistry<Project>()))
}

function openingNamed(floor: Floor | undefined, id: string): Opening {
  const found = floor?.openings.find((candidate) => candidate.id === id)
  if (found === undefined) {
    throw new Error(`expected an opening named ${id}`)
  }
  return found
}

function pastedEntities(opening: Opening): InstantiatedEntities {
  return { walls: [], openings: [opening], dimensions: [], ids: [opening.id] }
}

describe('placeOpening', () => {
  it('adds an opening that carries the entrance mark without the mark', () => {
    const project = projectWithMarkedDoor()

    dispatcherFor(project).dispatch(placeOpening(FLOOR_ID, markedDoor('second', PASTE_POSITION)))

    expect('entrance' in openingNamed(project.floors[0], 'second')).toBe(false)
  })
})

describe('pasteEntities', () => {
  it('adds a pasted marked door without the mark and leaves the source door marked', () => {
    const project = projectWithMarkedDoor()
    const copy = markedDoor('copy', PASTE_POSITION)

    dispatcherFor(project).dispatch(pasteEntities(FLOOR_ID, pastedEntities(copy)))

    expect('entrance' in openingNamed(project.floors[0], 'copy')).toBe(false)
    expect(openingNamed(project.floors[0], 'front').entrance).toBe(true)
  })
})

describe('addFloor', () => {
  it('adds a floor whose marked door loses the mark', () => {
    const project = projectWithMarkedDoor()
    const command = addFloor('Upper')
    command.params.floor.openings = [markedDoor('upstairs', DOOR_POSITION)]

    dispatcherFor(project).dispatch(command)

    expect('entrance' in openingNamed(project.floors[1], 'upstairs')).toBe(false)
  })
})

describe('setOpeningType', () => {
  it('removes the mark when a marked door becomes a window', () => {
    const project = projectWithMarkedDoor()

    dispatcherFor(project).dispatch(setOpeningType(FLOOR_ID, 'front', 'double-hung-window'))

    expect('entrance' in openingNamed(project.floors[0], 'front')).toBe(false)
  })

  it('keeps the mark when a marked door becomes another kind of door', () => {
    const project = projectWithMarkedDoor()

    dispatcherFor(project).dispatch(setOpeningType(FLOOR_ID, 'front', 'sliding-glass-door'))

    expect(openingNamed(project.floors[0], 'front').entrance).toBe(true)
  })
})
