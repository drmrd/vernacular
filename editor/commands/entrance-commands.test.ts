import { describe, it, expect, vi } from 'vitest'
import { createEntranceCommands } from './entrance-commands'
import { createCommandSet } from './command-set'
import type { CommandContext } from './command'
import { createSelectionStore } from '../../bridge'
import { createEditorSession } from '../../session/testing'
import {
  OPENING_NODE_PREFIX,
  WALL_NODE_PREFIX,
  addFloor,
  createEmptyProject,
  createOpening,
  createWall,
  markMainEntrance,
  placeOpening,
} from '../../core'
import type { ViewControls } from '../viewport/view-mode'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'

const GROUND_ID = 'ground'
const UPPER_ID = 'upper'
const WALL_ID = 'wall-1'

function wallIdOn(floorId: string): string {
  return `${WALL_ID}-${floorId}`
}
const SHARED_DOOR_ID = 'door'
const OTHER_DOOR_ID = 'back-door'
const WINDOW_ID = 'window'
const WALL_LENGTH = 6000
const FIRST_POSITION = 1000
const SECOND_POSITION = 3000
const THIRD_POSITION = 5000
const DOOR = 'single-swing-door'

interface PlacedOpening {
  id: string
  type: string
  position: number
}

function doorNode(openingId: string): string {
  return `${OPENING_NODE_PREFIX}${openingId}`
}

function floorWithWall(floorId: string, name: string) {
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH, y: 0 }, { id: wallIdOn(floorId) })
  return addFloor(name, { id: floorId, walls: [wall] })
}

function buildSession() {
  const session = createEditorSession(
    createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.0.0',
    }),
  )
  session.dispatch(floorWithWall(GROUND_ID, 'Ground'))
  session.dispatch(floorWithWall(UPPER_ID, 'Upper'))
  const place = (floorId: string, opening: PlacedOpening) =>
    session.dispatch(
      placeOpening(floorId, createOpening({ ...opening, hostWallId: wallIdOn(floorId) })),
    )
  place(GROUND_ID, { id: SHARED_DOOR_ID, type: DOOR, position: FIRST_POSITION })
  place(UPPER_ID, { id: SHARED_DOOR_ID, type: DOOR, position: FIRST_POSITION })
  place(UPPER_ID, { id: OTHER_DOOR_ID, type: DOOR, position: SECOND_POSITION })
  place(UPPER_ID, { id: WINDOW_ID, type: 'double-hung-window', position: THIRD_POSITION })
  return session
}

function buildContext() {
  const session = buildSession()
  const selection = createSelectionStore()
  const contextNow = (): CommandContext => ({
    session,
    selection,
    graph: session.getSceneGraph(),
    activeFloorId: UPPER_ID,
    openPalette: vi.fn(),
  })
  return { session, selection, contextNow }
}

function markedDoors(session: ReturnType<typeof buildSession>): string[] {
  return session
    .getProject()
    .floors.flatMap((floor) =>
      floor.openings
        .filter((opening) => opening.entrance === true)
        .map((opening) => `${floor.id}/${opening.id}`),
    )
}

function markCommand() {
  const command = createEntranceCommands().find((entry) => entry.id === 'mark-main-entrance')
  if (!command) {
    throw new Error('No mark-main-entrance command')
  }
  return command
}

describe('the mark-main-entrance palette command', () => {
  it('marks the selected door on the active floor and removes the mark on one undo', () => {
    const { session, selection, contextNow } = buildContext()
    const command = markCommand()
    selection.select(doorNode(SHARED_DOOR_ID))

    expect(command.label).toBe('Mark as main entrance')
    expect(command.isEnabled(contextNow())).toBe(true)

    command.run(contextNow())

    expect(markedDoors(session)).toEqual([`${UPPER_ID}/${SHARED_DOOR_ID}`])

    session.undo()

    expect(markedDoors(session)).toEqual([])
  })

  it('is disabled with nothing selected', () => {
    const { contextNow } = buildContext()

    expect(markCommand().isEnabled(contextNow())).toBe(false)
  })

  it('is disabled with two items selected', () => {
    const { selection, contextNow } = buildContext()
    selection.setSelection([doorNode(SHARED_DOOR_ID), doorNode(OTHER_DOOR_ID)])

    expect(markCommand().isEnabled(contextNow())).toBe(false)
  })

  it('is disabled with a window selected', () => {
    const { selection, contextNow } = buildContext()
    selection.select(doorNode(WINDOW_ID))

    expect(markCommand().isEnabled(contextNow())).toBe(false)
  })

  it('is disabled with a wall selected', () => {
    const { selection, contextNow } = buildContext()
    selection.select(`${WALL_NODE_PREFIX}${wallIdOn(UPPER_ID)}`)

    expect(markCommand().isEnabled(contextNow())).toBe(false)
  })

  it('is disabled with the marked door itself selected', () => {
    const { session, selection, contextNow } = buildContext()
    session.dispatch(markMainEntrance(UPPER_ID, SHARED_DOOR_ID))
    selection.select(doorNode(SHARED_DOOR_ID))

    expect(markCommand().isEnabled(contextNow())).toBe(false)
  })
})

describe('createCommandSet', () => {
  it('includes the command that marks the selected door as the main entrance', () => {
    const ids = createCommandSet({
      view: { mode: 'plan', setMode: vi.fn() } as unknown as ViewControls,
      snapStore: createSnapPreferencesStore(),
    }).map((command) => command.id)

    expect(ids).toContain('mark-main-entrance')
  })
})
