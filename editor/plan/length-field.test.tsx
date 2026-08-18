import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  InvalidLengthError,
  type UnitPreferences,
} from '../../core'
import { LengthField } from './length-field'

const INPUT_ID = 'opening-width-o1'
const LABEL = 'Width'
const CURRENT_MM = 900

function renderField(
  onCommitMm: (mm: number) => void,
  preferences: UnitPreferences = DEFAULT_METRIC_PREFERENCES,
  valueMm: number = CURRENT_MM,
) {
  render(
    <LengthField
      inputId={INPUT_ID}
      label={LABEL}
      valueMm={valueMm}
      preferences={preferences}
      onCommitMm={onCommitMm}
    />,
  )
}

// A notice is an explanation the field's owner attaches to a legitimate value,
// not a complaint about what the user typed.
const NOTICE = 'Limited to 1.20 m by a neighbouring opening on this wall.'
const UNPARSEABLE_HINT = 'Enter a number, or a length such as 2.4 m or 8 ft 6 in.'

function renderFieldWithNotice(notice: string, onCommitMm: (mm: number) => void = vi.fn()) {
  render(
    <LengthField
      inputId={INPUT_ID}
      label={LABEL}
      valueMm={CURRENT_MM}
      preferences={DEFAULT_METRIC_PREFERENCES}
      onCommitMm={onCommitMm}
      notice={notice}
    />,
  )
}

function unitPicker() {
  return screen.getByRole('group', { name: `${LABEL} unit` })
}

afterEach(cleanup)

describe('LengthField label and default unit', () => {
  it('associates its label with the input, with no unit baked into the label text', () => {
    renderField(vi.fn())

    // The entry unit now lives in a picker, so the label is the bare field name.
    expect(screen.getByLabelText(LABEL)).toBeInstanceOf(HTMLInputElement)
  })

  it('defaults a metric field to metres and shows the value as a bare magnitude', () => {
    renderField(vi.fn(), DEFAULT_METRIC_PREFERENCES, 1000)

    // 1000 mm is 1 m; the value is shown bare because the unit lives in the picker.
    expect(screen.getByLabelText(LABEL)).toHaveValue('1')
    expect(within(unitPicker()).getByRole('button', { name: 'm' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('defaults an imperial field to feet', () => {
    renderField(vi.fn(), DEFAULT_IMPERIAL_PREFERENCES, 304.8)

    expect(screen.getByLabelText(LABEL)).toHaveValue('1')
    expect(within(unitPicker()).getByRole('button', { name: 'ft' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('LengthField entry unit switching', () => {
  it('re-expresses the committed value when the entry unit changes', async () => {
    const user = userEvent.setup()
    renderField(vi.fn(), DEFAULT_METRIC_PREFERENCES, 1000)
    const input = screen.getByLabelText(LABEL)
    const picker = unitPicker()

    expect(input).toHaveValue('1')
    await user.click(within(picker).getByRole('button', { name: 'cm' }))
    expect(input).toHaveValue('100')
    await user.click(within(picker).getByRole('button', { name: 'mm' }))
    expect(input).toHaveValue('1000')
    await user.click(within(picker).getByRole('button', { name: 'm' }))
    expect(input).toHaveValue('1')
  })

  it('re-expresses a freshly typed value on a unit change without committing', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm, DEFAULT_METRIC_PREFERENCES, 1000)
    const input = screen.getByLabelText(LABEL)
    const picker = unitPicker()

    await user.click(within(picker).getByRole('button', { name: 'cm' }))
    await user.clear(input)
    await user.type(input, '200')
    await user.click(within(picker).getByRole('button', { name: 'm' }))

    // 200 cm re-expressed in metres is 2; switching the unit never dispatches.
    expect(input).toHaveValue('2')
    expect(onCommitMm).not.toHaveBeenCalled()
  })
})

describe('LengthField committing values', () => {
  it('commits a bare number read in the selected entry unit', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm)
    const input = screen.getByLabelText(LABEL)

    await user.clear(input)
    await user.type(input, '1.2{Enter}')

    expect(onCommitMm).toHaveBeenCalledTimes(1)
    expect(onCommitMm).toHaveBeenCalledWith(1200)
  })

  it('reads a bare number in centimetres after the entry unit is switched to cm', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm)
    const input = screen.getByLabelText(LABEL)

    await user.click(within(unitPicker()).getByRole('button', { name: 'cm' }))
    await user.clear(input)
    await user.type(input, '50{Enter}')

    expect(onCommitMm).toHaveBeenCalledWith(500)
  })

  it('parses an inline unit suffix regardless of the selected entry unit', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm)
    const input = screen.getByLabelText(LABEL)

    await user.clear(input)
    await user.type(input, '128 cm{Enter}')

    // The typed suffix wins over the selected metres unit: 128 cm is 1280 mm.
    expect(onCommitMm).toHaveBeenCalledWith(1280)
  })

  it('commits the parsed value on blur without pressing Enter', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm)
    const input = screen.getByLabelText(LABEL)

    await user.clear(input)
    await user.type(input, '1.2')
    // Leave the field the way a user does when they click the canvas: move focus
    // off the input, which fires a real blur. No Enter is pressed.
    await user.tab()

    expect(onCommitMm).toHaveBeenCalledTimes(1)
    expect(onCommitMm).toHaveBeenCalledWith(1200)
  })
})

describe('LengthField rejection handling', () => {
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
    await user.type(input, '-5{Enter}')

    // The entered text is kept so the user can correct it in place.
    expect(input).toHaveValue('-5')

    // A visible, recoverable error surfaces through the Field hint slot.
    const hint = document.querySelector('.ds-field__hint')
    expect(hint).not.toBeNull()
    expect(hint).toHaveTextContent(/\S/)

    // The control is marked invalid and points at the error text.
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', hint?.getAttribute('id') ?? '')
  })

  it('shows a hint and marks the field invalid when the typed text cannot be parsed as a length, dispatching nothing', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm)
    const input = screen.getByLabelText(LABEL)

    await user.clear(input)
    await user.type(input, 'twelve')
    // Leave the field without pressing Enter, the same way a click on the canvas would.
    await user.tab()

    const hint = document.querySelector('.ds-field__hint')
    expect(hint).not.toBeNull()
    expect(hint).toHaveTextContent('Enter a number, or a length such as 2.4 m or 8 ft 6 in.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onCommitMm).not.toHaveBeenCalled()
    // The rejected text stays in the field so the user can fix it in place
    // instead of retyping the whole value from scratch.
    expect(input).toHaveValue('twelve')
  })

  it('clears the hint and the invalid flag once a rejected entry is corrected to a valid length', async () => {
    const onCommitMm = vi.fn()
    const user = userEvent.setup()
    renderField(onCommitMm)
    const input = screen.getByLabelText(LABEL)

    await user.clear(input)
    await user.type(input, 'twelve')
    await user.tab()
    expect(input).toHaveAttribute('aria-invalid', 'true')

    await user.clear(input)
    await user.type(input, '1.2{Enter}')

    expect(document.querySelector('.ds-field__hint')).toBeNull()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(onCommitMm).toHaveBeenCalledWith(1200)
  })
})

describe('LengthField owner notices', () => {
  it('explains a legitimate value through the hint below the input when its owner supplies a notice', () => {
    renderFieldWithNotice(NOTICE)
    const input = screen.getByLabelText(LABEL)

    const hint = document.querySelector('.ds-field__hint')
    expect(hint).not.toBeNull()
    expect(hint).toHaveTextContent(NOTICE)
    // The explanation is announced with the control, not left floating beside it.
    expect(input).toHaveAttribute('aria-describedby', hint?.getAttribute('id') ?? '')
  })

  it('leaves the control valid while a notice is showing, because the value it explains is accepted', () => {
    renderFieldWithNotice(NOTICE)

    expect(screen.getByText(NOTICE)).toBeInTheDocument()
    expect(screen.getByLabelText(LABEL)).not.toHaveAttribute('aria-invalid')
  })

  it('gives the hint over to a rejected entry and returns it to the notice once the entry parses again', async () => {
    const user = userEvent.setup()
    renderFieldWithNotice(NOTICE)
    const input = screen.getByLabelText(LABEL)

    await user.clear(input)
    await user.type(input, 'twelve')
    await user.tab()

    // What the user just typed is the more urgent thing to say, so it wins the slot.
    expect(document.querySelector('.ds-field__hint')).toHaveTextContent(UNPARSEABLE_HINT)
    expect(screen.queryByText(NOTICE)).toBeNull()
    expect(input).toHaveAttribute('aria-invalid', 'true')

    await user.clear(input)
    await user.type(input, '1.2{Enter}')

    expect(document.querySelector('.ds-field__hint')).toHaveTextContent(NOTICE)
    expect(input).not.toHaveAttribute('aria-invalid')
  })
})

describe('LengthField rendering', () => {
  it('renders through the styled design-system field wrapper', () => {
    const { container } = render(
      <LengthField
        inputId={INPUT_ID}
        label={LABEL}
        valueMm={CURRENT_MM}
        preferences={DEFAULT_METRIC_PREFERENCES}
        onCommitMm={vi.fn()}
      />,
    )

    expect(container.querySelector('.ds-field')).not.toBeNull()
  })
})
