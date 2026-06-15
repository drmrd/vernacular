import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ROTATE_ENTITIES, type Command, type Point, type RotateEntitiesParams } from '../../core'
import { SelectionTransformPanel } from './selection-transform-panel'

// A fixed selection so each dispatched rotate command is deterministic. Plan
// space is y-up, so a counter-clockwise quarter turn is a positive radian angle
// and a clockwise quarter turn is negative.
const FLOOR_ID = 'floor-1'
const ENTITY_IDS = ['w1', 'd1'] as const
const CENTER: Point = { x: 50, y: 0 }
const QUARTER_TURN = Math.PI / 2
const ANGLE_PRECISION_DIGITS = 9

function renderPanel(dispatch: (command: Command) => void) {
  render(
    <SelectionTransformPanel
      floorId={FLOOR_ID}
      entityIds={ENTITY_IDS}
      center={CENTER}
      dispatch={dispatch}
    />,
  )
}

function onlyCommand(dispatch: ReturnType<typeof vi.fn>): Command<RotateEntitiesParams> {
  return dispatch.mock.calls[0]?.[0] as Command<RotateEntitiesParams>
}

afterEach(cleanup)

describe('SelectionTransformPanel', () => {
  it('dispatches a positive quarter turn about the center from the counter-clockwise control', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderPanel(dispatch)

    await user.click(screen.getByRole('button', { name: /counter-?clockwise|rotate left/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand(dispatch)
    expect(command.type).toBe(ROTATE_ENTITIES)
    expect(command.params).toEqual({
      floorId: FLOOR_ID,
      entityIds: [...ENTITY_IDS],
      pivot: CENTER,
      radians: QUARTER_TURN,
    })
  })

  it('dispatches a negative quarter turn about the center from the clockwise control', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderPanel(dispatch)

    await user.click(screen.getByRole('button', { name: /(?<!counter-?)clockwise|rotate right/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand(dispatch)
    expect(command.type).toBe(ROTATE_ENTITIES)
    expect(command.params).toEqual({
      floorId: FLOOR_ID,
      entityIds: [...ENTITY_IDS],
      pivot: CENTER,
      radians: -QUARTER_TURN,
    })
  })

  it('dispatches the typed angle in radians about the center when the angle entry is applied', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderPanel(dispatch)

    const angleInput = screen.getByRole('spinbutton', { name: /angle/i })
    await user.clear(angleInput)
    await user.type(angleInput, '30')
    await user.click(screen.getByRole('button', { name: /apply|rotate by|^rotate$/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand(dispatch)
    expect(command.type).toBe(ROTATE_ENTITIES)
    expect(command.params.floorId).toBe(FLOOR_ID)
    expect(command.params.entityIds).toEqual([...ENTITY_IDS])
    expect(command.params.pivot).toEqual(CENTER)
    expect(command.params.radians).toBeCloseTo((30 * Math.PI) / 180, ANGLE_PRECISION_DIGITS)
  })

  it('dispatches nothing when the empty angle entry is applied', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderPanel(dispatch)

    await user.click(screen.getByRole('button', { name: /apply|rotate by|^rotate$/i }))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('renders its rotate and apply controls as neutral design-system buttons', () => {
    renderPanel(vi.fn())

    const names = [
      /counter-?clockwise|rotate left/i,
      /(?<!counter-?)clockwise|rotate right/i,
      /apply|rotate by|^rotate$/i,
    ]
    for (const name of names) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveClass('ds-button')
      expect(button).toHaveClass('ds-button--neutral')
    }
  })
})
