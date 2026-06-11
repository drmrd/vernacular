import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { REMOVE_DIMENSION, type Command, type RemoveDimensionParams } from '../../core'
import { DimensionInspector } from './dimension-inspector'

// A single selected dimension, fixed so the formatted length and the dispatched
// command payload are deterministic. A metric project formats against the metric
// defaults, mirroring the opening inspector.
const FLOOR_ID = 'floor-1'
const DIMENSION_ID = 'd1'
const LENGTH_MM = 1000
const UNITS = 'metric' as const

// A metre-scale length reads in metres with two decimals under the adaptive
// metric rule: 1000 mm renders as "1.00 m", not "1000 mm".
const EXPECTED_LENGTH = '1.00 m'

function renderInspector(dispatch: (command: unknown) => void) {
  render(
    <DimensionInspector
      floorId={FLOOR_ID}
      dimensionId={DIMENSION_ID}
      length={LENGTH_MM}
      units={UNITS}
      dispatch={dispatch as never}
    />,
  )
}

function onlyCommand<P>(dispatch: ReturnType<typeof vi.fn>): Command<P> {
  return dispatch.mock.calls[0]?.[0] as Command<P>
}

afterEach(cleanup)

describe('DimensionInspector', () => {
  it('shows the measured length formatted for the active units', () => {
    renderInspector(vi.fn())

    expect(screen.getByText(EXPECTED_LENGTH)).toBeInTheDocument()
  })

  it('dispatches removeDimension for the floor and dimension from the remove control', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand<RemoveDimensionParams>(dispatch)
    expect(command.type).toBe(REMOVE_DIMENSION)
    expect(command.params.floorId).toBe(FLOOR_ID)
    expect(command.params.dimensionId).toBe(DIMENSION_ID)
  })
})
