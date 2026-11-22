import { describe, it, expect, afterEach } from 'vitest'
import { screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createOpening, createWall, OPENING_NODE_PREFIX, type Opening, type Wall } from '../../core'
import { renderInspector } from './inspector-test-support'

afterEach(cleanup)

const GUESS_NOTE = 'Vernacular treats this door as the entrance until one is marked.'
const ROOM_SIZE = 4000
const WIDE_DOOR_MM = 1000
const NARROW_DOOR_MM = 800

/** Four walls that close one room, so each door sits on an exterior run. */
function closedRoomWalls(): Wall[] {
  return [
    createWall({ x: 0, y: 0 }, { x: ROOM_SIZE, y: 0 }, { id: 'south' }),
    createWall({ x: ROOM_SIZE, y: 0 }, { x: ROOM_SIZE, y: ROOM_SIZE }, { id: 'east' }),
    createWall({ x: ROOM_SIZE, y: ROOM_SIZE }, { x: 0, y: ROOM_SIZE }, { id: 'north' }),
    createWall({ x: 0, y: ROOM_SIZE }, { x: 0, y: 0 }, { id: 'west' }),
  ]
}

/** A swing door; the widest door wins the entrance guess. */
function swingDoor(id: string, hostWallId: string, width: number): Opening {
  return createOpening({
    id,
    type: 'single-swing-door',
    hostWallId,
    position: ROOM_SIZE / 2,
    width,
  })
}

const nodeId = (id: string) => `${OPENING_NODE_PREFIX}${id}`
const mainEntrance = () => screen.getByRole('checkbox', { name: 'Main entrance' })

function renderTwoDoors() {
  return renderInspector({
    walls: closedRoomWalls(),
    openings: [
      swingDoor('wide', 'south', WIDE_DOOR_MM),
      swingDoor('narrow', 'north', NARROW_DOOR_MM),
    ],
  })
}

describe('Inspector main entrance role', () => {
  it('shows the guessed note on the door the guess picks and neither note nor tick on another door', () => {
    const { selection } = renderTwoDoors()

    act(() => {
      selection.select(nodeId('wide'))
    })
    expect(screen.getByText(GUESS_NOTE)).toBeInTheDocument()
    expect(mainEntrance()).not.toBeChecked()

    act(() => {
      selection.select(nodeId('narrow'))
    })
    expect(screen.queryByText(GUESS_NOTE)).toBeNull()
    expect(mainEntrance()).not.toBeChecked()
  })

  it('ticks the door that was marked and shows no tick and no note on the first door once a door is marked', async () => {
    const user = userEvent.setup()
    const { selection } = renderTwoDoors()
    act(() => {
      selection.select(nodeId('narrow'))
    })

    await user.click(mainEntrance())
    expect(mainEntrance()).toBeChecked()

    act(() => {
      selection.select(nodeId('wide'))
    })
    expect(mainEntrance()).not.toBeChecked()
    expect(screen.queryByText(GUESS_NOTE)).toBeNull()
  })

  it('follows the floor, so the upper floor copy of a marked ground floor door shows no tick', async () => {
    const user = userEvent.setup()
    const { selection, activeFloor } = renderInspector({
      walls: closedRoomWalls(),
      openings: [swingDoor('copied-door', 'south', WIDE_DOOR_MM)],
      upperFloor: {
        walls: closedRoomWalls(),
        openings: [swingDoor('copied-door', 'south', WIDE_DOOR_MM)],
      },
    })
    act(() => {
      selection.select(nodeId('copied-door'))
    })
    await user.click(mainEntrance())
    expect(mainEntrance()).toBeChecked()

    act(() => {
      activeFloor.setActiveFloorId('u')
    })

    expect(mainEntrance()).not.toBeChecked()
  })
})
