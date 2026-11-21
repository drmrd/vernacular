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
  type Wall,
} from '../../core'
import type { LibraryItem } from '../../storage'
import { handleFurnitureKey } from '../plan/authoring-tool-handlers'
import { renderInspector } from './inspector-test-support'

afterEach(cleanup)

const chair: LibraryItem = {
  reference: { scope: 'user', contentHash: 'chair-hash' },
  name: 'Chair',
  kind: 'furniture',
  categories: [],
  eras: [],
  footprint: { width: 600, depth: 600 },
  height: 750,
}

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
  it('shows a shared-floor note instead of the Floor chip when a selected room shares its floor with another room', () => {
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
        'This floor holds 2 rooms, so a finish here would repaint every one of them. Per-room floor and ceiling finishes are not available yet.',
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

describe('Inspector after a furniture piece is placed', () => {
  it('shows the furniture editor for the piece the place-furniture tool just dropped', () => {
    const { selection, session } = renderInspector()
    act(() => {
      handleFurnitureKey({
        session,
        selection,
        activeFloorId: 'g',
        candidate: { x: 0, y: 0 },
        setCandidate: () => undefined,
        setAnnouncement: () => undefined,
        event: new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
        armed: chair,
        rotation: 0,
      })
    })

    expect(screen.getByRole('heading', { name: 'Furniture' })).toBeInTheDocument()
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

describe('Inspector with a hung window in an exterior wall selected', () => {
  it('shows "Swap sash sides" unavailable, since the one room side sets the sashes', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ]
    const [exteriorWall] = walls
    if (exteriorWall === undefined) throw new Error('expected the room loop to hold four walls')
    const window = createOpening({
      type: 'double-hung-window',
      hostWallId: exteriorWall.id,
      position: 2000,
    })
    const { selection } = renderInspector({ walls, openings: [window] })
    act(() => {
      selection.select(`${OPENING_NODE_PREFIX}${window.id}`)
    })

    const button = screen.getByRole('button', { name: 'Swap sash sides' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(
      'The room side sets which way the sashes face on this wall.',
    )
  })
})

describe('Inspector with a hung window on a wall without one room side', () => {
  function swapSashSidesOn(walls: Wall[], hostWall: Wall) {
    const window = createOpening({
      type: 'double-hung-window',
      hostWallId: hostWall.id,
      position: 1000,
    })
    const { selection, session } = renderInspector({ walls, openings: [window] })
    act(() => {
      selection.select(`${OPENING_NODE_PREFIX}${window.id}`)
    })
    const facing = () => session.getProject().floors[0]?.openings[0]?.orientation.facing
    return { button: screen.getByRole('button', { name: 'Swap sash sides' }), facing }
  }

  async function expectSwapFlipsFacing(walls: Wall[], hostWall: Wall) {
    const { button, facing } = swapSashSidesOn(walls, hostWall)
    expect(button).not.toHaveAttribute('aria-disabled', 'true')
    const before = facing()

    await userEvent.setup().click(button)

    expect(facing()).toBe(before === 'positive' ? 'negative' : 'positive')
  }

  it('keeps "Swap sash sides" available and flips the facing on a wall between two rooms', async () => {
    const sharedWall = createWall({ x: 2000, y: 0 }, { x: 2000, y: 3000 })
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
      sharedWall,
    ]
    expect(deriveRooms(walls)).toHaveLength(2)

    await expectSwapFlipsFacing(walls, sharedWall)
  })

  it('keeps "Swap sash sides" available and flips the facing on a free-standing wall', async () => {
    const freeWall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 })
    expect(deriveRooms([freeWall])).toHaveLength(0)

    await expectSwapFlipsFacing([freeWall], freeWall)
  })
})
