import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_METRIC_PREFERENCES,
  InvalidLengthError,
  setRoomCeilingHeight,
  parseLength,
  type Command,
  type SetRoomCeilingHeightParams,
} from '../../core'
import { RoomCeilingHeightEditor } from './room-ceiling-height-editor'

// A single selected room, fixed so the formatted value and the parsed dispatch
// payload are both deterministic.
const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEED_CEILING_HEIGHT_MM = 2438

// Metric preferences keep the test deterministic: the formatter yields a known
// string and a bare number is read as millimeters.
const PREFERENCES = DEFAULT_METRIC_PREFERENCES
// The active metric system reads a bare number as millimeters, so the parsed
// dispatch value is computed with the same assumed unit the component uses.
const METRIC_ASSUMED_UNIT = 'mm' as const

const VALID_ENTRY = '3000'
const UNPARSEABLE_ENTRY = 'abc'
const OUT_OF_RANGE_ENTRY = '0'

const EXPECTED_PARSED_MM = parseLength(VALID_ENTRY, { assumeUnit: METRIC_ASSUMED_UNIT })

function renderEditor(dispatch: (command: unknown) => void) {
  render(
    <RoomCeilingHeightEditor
      roomKey={ROOM_KEY}
      ceilingHeight={SEED_CEILING_HEIGHT_MM}
      dispatch={dispatch}
      preferences={PREFERENCES}
    />,
  )
}

afterEach(cleanup)

describe('RoomCeilingHeightEditor', () => {
  it('shows the current ceiling height formatted for the active units in a labeled input', () => {
    renderEditor(vi.fn())

    const input = screen.getByLabelText(/ceiling height/i)
    expect(input).not.toHaveValue('')
    expect(input).not.toHaveValue(String(SEED_CEILING_HEIGHT_MM))
  })

  it('dispatches one parsed setRoomCeilingHeight when a valid entry is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(/ceiling height/i)
    await user.clear(input)
    await user.type(input, `${VALID_ENTRY}{Enter}`)

    const expected = setRoomCeilingHeight(ROOM_KEY, EXPECTED_PARSED_MM)
    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as Command<SetRoomCeilingHeightParams>
    expect(command.type).toBe(expected.type)
    expect(command.params).toEqual(expected.params)
  })

  it('commits the parsed ceiling height on blur, without pressing Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(/ceiling height/i)
    await user.clear(input)
    await user.type(input, VALID_ENTRY)
    // Leave the field (focus moves away) without pressing Enter, so the count
    // stays exact and the blur is the only thing that can commit.
    await user.tab()

    const expected = setRoomCeilingHeight(ROOM_KEY, EXPECTED_PARSED_MM)
    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as Command<SetRoomCeilingHeightParams>
    expect(command.type).toBe(expected.type)
    expect(command.params).toEqual(expected.params)
  })

  it('dispatches nothing when an unparseable entry is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(/ceiling height/i)
    await user.clear(input)
    await user.type(input, `${UNPARSEABLE_ENTRY}{Enter}`)

    expect(dispatch).not.toHaveBeenCalled()
    expect(input).toHaveValue(UNPARSEABLE_ENTRY)
  })

  it('shows an inline error and keeps the typed text when a commit is rejected for being out of range', async () => {
    const dispatch = vi.fn(() => {
      // Mirror the dispatcher: a throwing handler is wrapped and rolled back,
      // with the original domain rejection carried on `.cause`.
      const rejection = new Error('Command "set-room-ceiling-height" failed and was rolled back')
      rejection.cause = new InvalidLengthError('Ceiling height', 0)
      throw rejection
    })
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(/ceiling height/i)
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
