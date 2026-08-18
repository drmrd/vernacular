import { describe, it, expect, afterEach } from 'vitest'
import { screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createDimension,
  createOpening,
  createStair,
  createWall,
  deriveRooms,
  DIMENSION_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  STAIR_NODE_PREFIX,
} from '../../core'
import { renderInspector } from './inspector-test-support'

afterEach(cleanup)

describe('Inspector with an opening selected', () => {
  const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 })
  const opening = createOpening({ type: 'single-swing-door', hostWallId: wall.id, position: 500 })

  it('shows no Transform section when only an opening is selected, since an opening rides its host wall and cannot be moved or rotated directly', () => {
    const { selection } = renderInspector({ walls: [wall], openings: [opening] })
    act(() => {
      selection.select(`${OPENING_NODE_PREFIX}${opening.id}`)
    })
    expect(screen.queryByText('Transform')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rotate clockwise' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rotate counter-clockwise' })).toBeNull()
  })

  it('shows the Transform section when a wall and an opening are selected together, since the wall is still transformable', () => {
    const { selection } = renderInspector({ walls: [wall], openings: [opening] })
    act(() => {
      selection.setSelection([`wall:${wall.id}`, `${OPENING_NODE_PREFIX}${opening.id}`])
    })
    expect(screen.getByText('Transform')).toBeInTheDocument()
  })
})

describe('Inspector after an opening resize is undone', () => {
  it('shows the restored width in the Width field, not the width the undo threw away', async () => {
    const user = userEvent.setup()
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 })
    // The fixture project is imperial and a length field defaults to feet, so a
    // 914.4 mm opening reads as a clean "3".
    const opening = createOpening({
      type: 'single-swing-door',
      hostWallId: wall.id,
      position: 2000,
      width: 914.4,
    })
    const { selection, session } = renderInspector({ walls: [wall], openings: [opening] })
    act(() => {
      selection.select(`${OPENING_NODE_PREFIX}${opening.id}`)
    })

    const widthInput = screen.getByLabelText('Width')
    expect(widthInput).toHaveValue('3')

    await user.clear(widthInput)
    await user.type(widthInput, '4{Enter}')
    expect(widthInput).toHaveValue('4')

    act(() => {
      session.undo()
    })

    expect(screen.getByLabelText('Width')).toHaveValue('3')
  })
})

describe('Inspector with a room selected', () => {
  it('shows a whole-storey note instead of the Floor chip when a selected room shares its storey with another room', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 2000, y: 0 }),
      createWall({ x: 2000, y: 0 }, { x: 2000, y: 1000 }),
      createWall({ x: 2000, y: 1000 }, { x: 0, y: 1000 }),
      createWall({ x: 0, y: 1000 }, { x: 0, y: 0 }),
      createWall({ x: 1000, y: 0 }, { x: 1000, y: 1000 }),
    ]
    const rooms = deriveRooms(walls)
    expect(rooms).toHaveLength(2)
    const [room] = rooms
    if (room === undefined) throw new Error('expected the split wall loop to derive two rooms')
    const { selection } = renderInspector({ walls })
    act(() => {
      selection.select(room.id)
    })

    expect(
      screen.getByText(
        'This storey holds 2 rooms, so a finish here would repaint every one of them. Per-room floor and ceiling finishes are not available yet.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Floor' })).toBeNull()
  })
})

describe('Inspector with a stair selected', () => {
  it("renders the stair inspector's angle field when exactly one stair is selected", () => {
    const stair = createStair({
      id: 's1',
      connection: { fromFloorId: 'g', toFloorId: 'upper' },
    })
    const { selection } = renderInspector({ stairs: [stair] })
    act(() => {
      selection.select(`${STAIR_NODE_PREFIX}${stair.id}`)
    })
    expect(screen.getByLabelText('Angle (deg)')).toBeInTheDocument()
  })

  it('shows a Stair component title when exactly one stair is selected', () => {
    const stair = createStair({
      id: 's1',
      connection: { fromFloorId: 'g', toFloorId: 'upper' },
    })
    const { selection } = renderInspector({ stairs: [stair] })
    act(() => {
      selection.select(`${STAIR_NODE_PREFIX}${stair.id}`)
    })
    const title = screen.getByRole('heading', { level: 3 })
    expect(title).toHaveTextContent(/stair/i)
  })
})

describe('Inspector with a dimension selected', () => {
  it('shows Remove unarmed for a newly selected dimension, even after arming Remove on a different one', async () => {
    const user = userEvent.setup()
    const dimensionA = createDimension({
      id: 'dim-a',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
    })
    const dimensionB = createDimension({
      id: 'dim-b',
      start: { x: 0, y: 500 },
      end: { x: 1000, y: 500 },
    })
    const { selection } = renderInspector({ dimensions: [dimensionA, dimensionB] })

    act(() => {
      selection.select(`${DIMENSION_NODE_PREFIX}${dimensionA.id}`)
    })
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeInTheDocument()

    act(() => {
      selection.select(`${DIMENSION_NODE_PREFIX}${dimensionB.id}`)
    })

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm remove' })).toBeNull()
  })
})
