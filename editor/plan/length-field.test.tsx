import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_METRIC_PREFERENCES, parseLength } from '../../core'
import { LengthField } from './length-field'

// A metric project reads a bare number as millimeters, so a typed entry parses
// to that exact millimetre value. Fixed so the committed payload is deterministic.
const INPUT_ID = 'opening-width-o1'
const LABEL = 'Width'
const CURRENT_MM = 900
const METRIC_ASSUMED_UNIT = 'mm' as const
const ENTERED_VALUE = '1200'
const EXPECTED_MM = parseLength(ENTERED_VALUE, { assumeUnit: METRIC_ASSUMED_UNIT })

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
