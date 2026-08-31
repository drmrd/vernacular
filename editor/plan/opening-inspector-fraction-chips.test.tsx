import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RESIZE_OPENING, parseLength, type Command, type ResizeOpeningParams } from '../../core'
import {
  HEIGHT_MM,
  SILL_HEIGHT_MM,
  buildOpeningOfWidth,
  renderInspector,
} from './opening-inspector-test-helpers'

// A width with a 1/4" remainder, so a chip that sets the fraction to 1/2" is
// distinguishable from a chip that merely adds 1/2" to whatever is already there.
const WIDTH_WITH_QUARTER_INCH_REMAINDER_MM = parseLength(`30 1/4"`)
const EXPECTED_WIDTH_WITH_HALF_INCH_REMAINDER_MM = parseLength(`30 1/2"`)

// A width with no fractional remainder at all, so no chip should read as active.
const WIDTH_WITH_NO_FRACTIONAL_REMAINDER_MM = parseLength(`30"`)

function expectDispatchedWidth(dispatch: ReturnType<typeof vi.fn>, calls: number, width: number) {
  expect(dispatch).toHaveBeenCalledTimes(calls)
  const command = dispatch.mock.calls[calls - 1]?.[0] as Command<ResizeOpeningParams>
  expect(command).toMatchObject({
    type: RESIZE_OPENING,
    params: { dimensions: { width, height: HEIGHT_MM, sillHeight: SILL_HEIGHT_MM } },
  })
}

afterEach(cleanup)

describe('OpeningInspector fraction chips', () => {
  it('sets the fractional part of the dimension on each press, instead of adding to the current value', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch, 'imperial', {
      opening: buildOpeningOfWidth(WIDTH_WITH_QUARTER_INCH_REMAINDER_MM),
    })

    const widthChips = screen.getByRole('list', { name: /fraction chips for width/i })
    const halfInchChip = within(widthChips).getByRole('button', { name: /1\/2/i })

    // A first press sets the fraction to 1/2", it does not add 1/2" to 1/4". A
    // second press of the same chip is idempotent: it does not add a second 1/2".
    await user.click(halfInchChip)
    expectDispatchedWidth(dispatch, 1, EXPECTED_WIDTH_WITH_HALF_INCH_REMAINDER_MM)
    await user.click(halfInchChip)
    expectDispatchedWidth(dispatch, 2, EXPECTED_WIDTH_WITH_HALF_INCH_REMAINDER_MM)

    // The chip's name should describe what it now does: set the fraction, not add to it.
    expect(halfInchChip).toHaveAccessibleName(/set fraction to 1\/2 inch/i)
  })

  it('marks the fraction chip matching the current value as pressed', () => {
    renderInspector(vi.fn(), 'imperial', {
      opening: buildOpeningOfWidth(EXPECTED_WIDTH_WITH_HALF_INCH_REMAINDER_MM),
    })

    // The width already carries a 1/2" remainder, so its chip reads as pressed and no
    // other chip does, even though nothing has been clicked in this render.
    const widthChips = screen.getByRole('list', { name: /fraction chips for width/i })
    const halfInchChip = within(widthChips).getByRole('button', { name: /1\/2/i })
    const quarterInchChip = within(widthChips).getByRole('button', { name: /1\/4/i })
    expect(halfInchChip).toHaveAttribute('aria-pressed', 'true')
    expect(quarterInchChip).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks no fraction chip as pressed when the width has no fractional remainder', () => {
    renderInspector(vi.fn(), 'imperial', {
      opening: buildOpeningOfWidth(WIDTH_WITH_NO_FRACTIONAL_REMAINDER_MM),
    })

    // A whole-inch width carries no fractional remainder, so every chip reads unpressed.
    const widthChips = screen.getByRole('list', { name: /fraction chips for width/i })
    within(widthChips)
      .getAllByRole('button')
      .forEach((chip) => expect(chip).toHaveAttribute('aria-pressed', 'false'))
  })
})
