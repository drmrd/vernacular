import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ROTATE_STAIR, createStair, type Command, type RotateStairParams } from '../../core'
import { StairInspector } from './stair-inspector'

const STAIR_ID = 's1'
const NEW_ANGLE_DEGREES = '45'
const EXPECTED_ANGLE_RADIANS = (45 * Math.PI) / 180
const QUARTER_TURN_RADIANS = Math.PI / 2
const QUARTER_TURN_DEGREES = '90'

function renderInspector(dispatch: (command: unknown) => void, rotation = 0) {
  const stair = createStair({
    id: STAIR_ID,
    rotation,
    connection: { fromFloorId: 'ground', toFloorId: 'upper' },
  })
  render(<StairInspector stair={stair} dispatch={dispatch as never} />)
}

function commandOfType<P>(
  dispatch: ReturnType<typeof vi.fn>,
  type: string,
): Command<P> | undefined {
  return dispatch.mock.calls.find((call) => call[0]?.type === type)?.[0] as Command<P> | undefined
}

afterEach(cleanup)

describe('StairInspector', () => {
  it('dispatches rotateStair with the entered angle in radians when it is committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const angleInput = screen.getByLabelText('Angle (deg)')
    await user.clear(angleInput)
    await user.type(angleInput, `${NEW_ANGLE_DEGREES}{Enter}`)

    const command = commandOfType<RotateStairParams>(dispatch, ROTATE_STAIR)
    expect(command).toBeDefined()
    expect(command?.params.stairId).toBe(STAIR_ID)
    expect(command?.params.rotation).toBeCloseTo(EXPECTED_ANGLE_RADIANS)
  })

  it("shows the stair's current angle in degrees", () => {
    renderInspector(vi.fn(), QUARTER_TURN_RADIANS)

    expect(screen.getByLabelText('Angle (deg)')).toHaveValue(QUARTER_TURN_DEGREES)
  })
})
