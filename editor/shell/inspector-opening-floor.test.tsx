import { describe, it, expect, afterEach } from 'vitest'
import { screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createOpening, createWall, OPENING_NODE_PREFIX } from '../../core'
import { renderInspector } from './inspector-test-support'

afterEach(cleanup)

const SHARED_ID = 'copied-door'
// The fixture project is imperial and a length field defaults to feet, so
// 914.4 mm reads as "3" and 1219.2 mm reads as "4".
const GROUND_WIDTH_MM = 914.4
const UPPER_WIDTH_MM = 1219.2

function buildDoorOnNewWall(width: number, id: string) {
  const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 })
  const door = createOpening({
    id,
    type: 'single-swing-door',
    hostWallId: wall.id,
    position: 2000,
    width,
  })
  return { wall, door }
}

describe('Inspector when opening ids repeat across floors', () => {
  it('shows the opening on the active floor, and an edit changes that floor and leaves the other alone', async () => {
    const user = userEvent.setup()
    const ground = buildDoorOnNewWall(GROUND_WIDTH_MM, SHARED_ID)
    const upper = buildDoorOnNewWall(UPPER_WIDTH_MM, SHARED_ID)
    const { selection, activeFloor, session } = renderInspector({
      walls: [ground.wall],
      openings: [ground.door],
      upperFloor: { walls: [upper.wall], openings: [upper.door] },
    })
    act(() => {
      activeFloor.setActiveFloorId('u')
      selection.select(`${OPENING_NODE_PREFIX}${SHARED_ID}`)
    })

    const widthInput = screen.getByLabelText('Width')
    expect(widthInput).toHaveValue('4')

    await user.clear(widthInput)
    await user.type(widthInput, '5{Enter}')

    const [groundFloor, upperFloor] = session.getProject().floors
    expect(groundFloor?.openings[0]?.width).toBeCloseTo(GROUND_WIDTH_MM)
    expect(upperFloor?.openings[0]?.width).toBeCloseTo(1524)
  })
})

describe('Inspector with an opening that only another floor holds', () => {
  it('still shows the ground floor opening while the upper floor is active', () => {
    const ground = buildDoorOnNewWall(GROUND_WIDTH_MM, 'ground-only-door')
    const upper = buildDoorOnNewWall(UPPER_WIDTH_MM, 'upper-only-door')
    const { selection, activeFloor } = renderInspector({
      walls: [ground.wall],
      openings: [ground.door],
      upperFloor: { walls: [upper.wall], openings: [upper.door] },
    })
    act(() => {
      activeFloor.setActiveFloorId('u')
      selection.select(`${OPENING_NODE_PREFIX}ground-only-door`)
    })

    expect(screen.getByLabelText('Width')).toHaveValue('3')
  })
})
