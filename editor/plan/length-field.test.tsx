import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_METRIC_PREFERENCES, InvalidLengthError, parseLength } from '../../core'
import { LengthField } from './length-field'
import { WallThicknessEditor } from './wall-thickness-editor'
import { RoomCeilingHeightEditor } from './room-ceiling-height-editor'

// A metric project reads a bare number as millimeters, so a typed entry parses
// to that exact millimetre value. Fixed so the committed payload is deterministic.
const INPUT_ID = 'opening-width-o1'
const LABEL = 'Width'
const CURRENT_MM = 900
const METRIC_ASSUMED_UNIT = 'mm' as const
const ENTERED_VALUE = '1200'
const EXPECTED_MM = parseLength(ENTERED_VALUE, { assumeUnit: METRIC_ASSUMED_UNIT })
const OUT_OF_RANGE_ENTRY = '-5'

function renderField(onCommitMm: (mm: number) => void) {
  render(
    <LengthField
      inputId={INPUT_ID}
      label={LABEL}
      valueMm={CURRENT_MM}
      preferences={DEFAULT_METRIC_PREFERENCES}
      assumeUnit={METRIC_ASSUMED_UNIT}
      onCommitMm={onCommitMm}
    />,
  )
}

afterEach(cleanup)

describe('LengthField', () => {
  it('associates its label with the input', () => {
    renderField(vi.fn())

    expect(screen.getByLabelText(LABEL)).toBeInstanceOf(HTMLInputElement)
  })

  it('commits the parsed millimetre value when Enter is pressed', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, `${ENTERED_VALUE}{Enter}`)

    expect(onCommitMm).toHaveBeenCalledTimes(1)
    expect(onCommitMm).toHaveBeenCalledWith(EXPECTED_MM)
  })

  it('commits the parsed millimetre value on blur without pressing Enter', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm)

    const input = screen.getByLabelText(LABEL)
    await user.clear(input)
    await user.type(input, ENTERED_VALUE)
    // Leave the field the way a user does when they click the canvas: move
    // focus off the input, which fires a real blur. No Enter is pressed.
    await user.tab()

    expect(onCommitMm).toHaveBeenCalledTimes(1)
    expect(onCommitMm).toHaveBeenCalledWith(EXPECTED_MM)
  })

  it('shows an inline error and keeps the typed text when a commit is rejected for being out of range', async () => {
    const onCommitMm = vi.fn(() => {
      // Mirror the real path: onCommitMm -> parent dispatch -> the dispatcher
      // rolls back a throwing handler and rethrows a wrapper carrying the
      // original domain rejection on `.cause`.
      const rejection = new Error('Command "resize-opening" failed and was rolled back')
      rejection.cause = new InvalidLengthError('Width', -5)
      throw rejection
    })
    const user = userEvent.setup()
    renderField(onCommitMm)

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

  it('surfaces the assumed unit in the length-field labels across the inspector', () => {
    // A bare number typed without a unit token is read as the field's assumed
    // unit. Spelling that unit out in the label keeps the entry unambiguous.
    render(
      <>
        <LengthField
          inputId={INPUT_ID}
          label="Width"
          valueMm={CURRENT_MM}
          preferences={DEFAULT_METRIC_PREFERENCES}
          assumeUnit="in"
          onCommitMm={vi.fn()}
        />
        <WallThicknessEditor
          floorId="ground"
          wallId="wall-1"
          thickness={100}
          dispatch={vi.fn()}
          preferences={DEFAULT_METRIC_PREFERENCES}
        />
        <RoomCeilingHeightEditor
          roomKey="wall-1|wall-2|wall-3"
          ceilingHeight={2438}
          dispatch={vi.fn()}
          preferences={DEFAULT_METRIC_PREFERENCES}
        />
      </>,
    )

    expect(screen.getByLabelText('Width (in)')).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByLabelText('Thickness (mm)')).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByLabelText('Ceiling height (mm)')).toBeInstanceOf(HTMLInputElement)
  })

  it('renders through the styled design-system field wrapper', () => {
    const { container } = render(
      <LengthField
        inputId={INPUT_ID}
        label={LABEL}
        valueMm={CURRENT_MM}
        preferences={DEFAULT_METRIC_PREFERENCES}
        assumeUnit={METRIC_ASSUMED_UNIT}
        onCommitMm={vi.fn()}
      />,
    )

    expect(container.querySelector('.ds-field')).not.toBeNull()
  })
})
