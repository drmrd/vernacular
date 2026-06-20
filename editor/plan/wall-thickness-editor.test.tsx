import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_METRIC_PREFERENCES,
  InvalidLengthError,
  SET_WALL_THICKNESS,
  parseLength,
  type Command,
  type SetWallThicknessParams,
} from '../../core'
import { WallThicknessEditor } from './wall-thickness-editor'

// A single selected wall, fixed so the formatted value and the parsed
// dispatch payload are both deterministic.
const FLOOR_ID = 'ground'
const WALL_ID = 'wall-1'
const CURRENT_THICKNESS_MM = 100

// Metric preferences keep the test deterministic: the formatter yields a known
// string and a bare number is read as millimeters.
const PREFERENCES = DEFAULT_METRIC_PREFERENCES
// The active metric system reads a bare number as millimeters, so the parsed
// dispatch value is computed with the same assumed unit the component uses.
const METRIC_ASSUMED_UNIT = 'mm' as const

const VALID_ENTRY = '150'
const UNPARSEABLE_ENTRY = 'abc'
const OUT_OF_RANGE_ENTRY = '-5'

// A wall-thickness-scale length reads in centimetres with one decimal under the
// adaptive metric rule: 100 mm renders as "10.0 cm", not "100 mm".
const EXPECTED_FORMATTED = '10.0 cm'
const EXPECTED_PARSED_MM = parseLength(VALID_ENTRY, { assumeUnit: METRIC_ASSUMED_UNIT })

function renderEditor(dispatch: (command: unknown) => void) {
  render(
    <WallThicknessEditor
      floorId={FLOOR_ID}
      wallId={WALL_ID}
      thickness={CURRENT_THICKNESS_MM}
      dispatch={dispatch}
      preferences={PREFERENCES}
    />,
  )
}

afterEach(cleanup)

describe('WallThicknessEditor', () => {
  it('shows the current thickness formatted for the active units in a labeled input', () => {
    renderEditor(vi.fn())

    const input = screen.getByLabelText(/thickness/i)
    expect(input).toHaveValue(EXPECTED_FORMATTED)
  })

  it('dispatches one parsed setWallThickness when a valid entry is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(/thickness/i)
    await user.clear(input)
    await user.type(input, `${VALID_ENTRY}{Enter}`)

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as Command<SetWallThicknessParams>
    expect(command.type).toBe(SET_WALL_THICKNESS)
    expect(command.params).toEqual({
      floorId: FLOOR_ID,
      wallId: WALL_ID,
      thickness: EXPECTED_PARSED_MM,
    })
  })

  it('dispatches nothing when an unparseable entry is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(/thickness/i)
    await user.clear(input)
    await user.type(input, `${UNPARSEABLE_ENTRY}{Enter}`)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('shows an inline error and keeps the typed text when a commit is rejected for being out of range', async () => {
    const dispatch = vi.fn(() => {
      // Mirror the dispatcher: a throwing handler is wrapped and rolled back,
      // with the original domain rejection carried on `.cause`.
      const rejection = new Error('Command "set-wall-thickness" failed and was rolled back')
      rejection.cause = new InvalidLengthError('Thickness', -5)
      throw rejection
    })
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(/thickness/i)
    await user.clear(input)
    await user.type(input, `${OUT_OF_RANGE_ENTRY}{Enter}`)

    // The entered text is kept so the user can correct it in place.
    expect(input).toHaveValue(OUT_OF_RANGE_ENTRY)

    // A visible, recoverable error surfaces through the Field hint slot.
    const hint = document.querySelector('.ds-field__hint')
    expect(hint).not.toBeNull()
    expect(hint).toHaveTextContent(/\S/)

    // The control is marked invalid and points at the error text.
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', hint?.getAttribute('id') ?? '')
  })
})
