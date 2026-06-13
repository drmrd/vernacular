import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_METRIC_PREFERENCES,
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
})
