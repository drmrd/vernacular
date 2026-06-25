import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_METRIC_PREFERENCES,
  InvalidLengthError,
  SET_WALL_THICKNESS,
  type Command,
  type SetWallThicknessParams,
} from '../../core'
import { WallThicknessEditor } from './wall-thickness-editor'

// A single selected wall, fixed so the displayed value and the parsed dispatch
// payload are both deterministic.
const FLOOR_ID = 'ground'
const WALL_ID = 'wall-1'
const CURRENT_THICKNESS_MM = 100

// Metric preferences default the entry unit to metres, so a bare number is read
// as metres and the field never bakes a unit into its label.
const PREFERENCES = DEFAULT_METRIC_PREFERENCES

const LABEL = 'Thickness'
// 150 mm entered in metres is 0.15 m; the picker is used to switch to mm.
const METRE_ENTRY = '0.15'
const EXPECTED_PARSED_MM = 150
const UNPARSEABLE_ENTRY = 'abc'
const OUT_OF_RANGE_ENTRY = '-5'

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

function unitPicker() {
  return screen.getByRole('group', { name: `${LABEL} unit` })
}

afterEach(cleanup)

describe('WallThicknessEditor', () => {
  it('labels the field without a baked-in unit and renders a metric entry-unit picker', () => {
    renderEditor(vi.fn())

    // The unit now lives in a selectable picker, so the label is the bare name.
    expect(screen.getByLabelText(LABEL)).toBeInstanceOf(HTMLInputElement)
    expect(within(unitPicker()).getByRole('button', { name: 'm' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows the current thickness as a bare magnitude in the default metric unit', () => {
    renderEditor(vi.fn())

    // 100 mm is 0.1 m; the value is bare because the unit lives in the picker.
    expect(screen.getByLabelText(LABEL)).toHaveValue('0.1')
  })

  it('dispatches one parsed setWallThickness when a bare metric entry is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, `${METRE_ENTRY}{Enter}`)

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as Command<SetWallThicknessParams>
    expect(command.type).toBe(SET_WALL_THICKNESS)
    expect(command.params).toEqual({
      floorId: FLOOR_ID,
      wallId: WALL_ID,
      thickness: EXPECTED_PARSED_MM,
    })
  })

  it('reads a bare number in millimetres after the entry unit is switched to mm', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.click(within(unitPicker()).getByRole('button', { name: 'mm' }))
    await user.clear(input)
    await user.type(input, '150{Enter}')

    const command = dispatch.mock.calls[0]?.[0] as Command<SetWallThicknessParams>
    expect(command.params.thickness).toBe(EXPECTED_PARSED_MM)
  })

  it('parses an inline unit suffix regardless of the selected entry unit', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, '15 cm{Enter}')

    // 15 cm is 150 mm, even though the selected entry unit is metres.
    const command = dispatch.mock.calls[0]?.[0] as Command<SetWallThicknessParams>
    expect(command.params.thickness).toBe(EXPECTED_PARSED_MM)
  })

  it('commits one parsed setWallThickness when a valid entry is committed on blur', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, METRE_ENTRY)
    await user.tab()

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as Command<SetWallThicknessParams>
    expect(command.type).toBe(SET_WALL_THICKNESS)
    expect(command.params.thickness).toBe(EXPECTED_PARSED_MM)
  })

  it('dispatches nothing when an unparseable entry is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, `${UNPARSEABLE_ENTRY}{Enter}`)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispatches nothing when an unparseable entry is blurred', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(dispatch)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, UNPARSEABLE_ENTRY)
    await user.tab()

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
