import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_METRIC_PREFERENCES,
  InvalidLengthError,
  setRoomCeilingHeight,
  type Command,
  type SetRoomCeilingHeightParams,
} from '../../core'
import { RoomCeilingHeightEditor } from './room-ceiling-height-editor'

// A single selected room, fixed so the displayed value and the parsed dispatch
// payload are both deterministic.
const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEED_CEILING_HEIGHT_MM = 2438

// Metric preferences default the entry unit to metres, so a bare number is read
// as metres and the field never bakes a unit into its label.
const PREFERENCES = DEFAULT_METRIC_PREFERENCES

const LABEL = 'Ceiling height'
// 3000 mm entered in metres is 3 m.
const METRE_ENTRY = '3'
const EXPECTED_PARSED_MM = 3000
const UNPARSEABLE_ENTRY = 'abc'
const OUT_OF_RANGE_ENTRY = '0'

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

function unitPicker() {
  return screen.getByRole('group', { name: `${LABEL} unit` })
}

afterEach(cleanup)

describe('RoomCeilingHeightEditor', () => {
  it('labels the field without a baked-in unit and renders a metric entry-unit picker', () => {
    renderEditor(vi.fn())

    // The unit now lives in a selectable picker, so the label is the bare name.
    expect(screen.getByLabelText(LABEL)).toBeInstanceOf(HTMLInputElement)
    expect(within(unitPicker()).getByRole('button', { name: 'm' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows the current ceiling height as a bare magnitude rather than the raw millimetres', () => {
    renderEditor(vi.fn())

    const input = screen.getByLabelText(LABEL)
    expect(input).not.toHaveValue('')
    expect(input).not.toHaveValue(String(SEED_CEILING_HEIGHT_MM))
  })

  it('dispatches one parsed setRoomCeilingHeight when a bare metric entry is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, `${METRE_ENTRY}{Enter}`)

    const expected = setRoomCeilingHeight(ROOM_KEY, EXPECTED_PARSED_MM)
    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as Command<SetRoomCeilingHeightParams>
    expect(command.type).toBe(expected.type)
    expect(command.params).toEqual(expected.params)
  })

  it('reads a bare number in millimetres after the entry unit is switched to mm', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.click(within(unitPicker()).getByRole('button', { name: 'mm' }))
    await user.clear(input)
    await user.type(input, '3000{Enter}')

    const command = dispatch.mock.calls[0]?.[0] as Command<SetRoomCeilingHeightParams>
    expect(command.params.height).toBe(EXPECTED_PARSED_MM)
  })

  it('parses an inline unit suffix regardless of the selected entry unit', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, '300 cm{Enter}')

    // 300 cm is 3000 mm, even though the selected entry unit is metres.
    const command = dispatch.mock.calls[0]?.[0] as Command<SetRoomCeilingHeightParams>
    expect(command.params.height).toBe(EXPECTED_PARSED_MM)
  })

  it('commits the parsed ceiling height on blur, without pressing Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, METRE_ENTRY)
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

    const input = screen.getByLabelText(LABEL)
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

    const input = screen.getByLabelText(LABEL)
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
