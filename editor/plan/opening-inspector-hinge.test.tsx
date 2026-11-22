import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { flipOpening } from '../../core'
import {
  FLOOR_ID,
  OPENING_ID,
  buildOpeningOfType,
  renderInspector,
} from './opening-inspector-test-support'

const WINDOW_SILL_MM = 900
const NO_HINGE_SIDE_REASON = 'This kind of opening has no hinge side to choose.'

afterEach(cleanup)

describe('OpeningInspector hinge control on an opening with no hinge side', () => {
  it('marks Flip hinge unavailable for a hung window and gives its reason', () => {
    renderInspector(vi.fn(), 'metric', {
      opening: buildOpeningOfType('double-hung-window', WINDOW_SILL_MM),
    })

    const button = screen.getByRole('button', { name: 'Flip hinge' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toHaveAttribute('disabled')
    expect(button).toHaveAttribute('title', NO_HINGE_SIDE_REASON)
    expect(button).toHaveAccessibleDescription(NO_HINGE_SIDE_REASON)
  })

  it('dispatches nothing when Flip hinge is clicked on a hung window', async () => {
    const dispatch = vi.fn()
    renderInspector(dispatch, 'metric', {
      opening: buildOpeningOfType('double-hung-window', WINDOW_SILL_MM),
    })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Flip hinge' }))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('marks Flip hinge unavailable for a pocket door with the same reason', () => {
    renderInspector(vi.fn(), 'metric', { opening: buildOpeningOfType('pocket-door') })

    const button = screen.getByRole('button', { name: 'Flip hinge' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(NO_HINGE_SIDE_REASON)
  })

  it('gives each unavailable button its own reason when both are unavailable', () => {
    renderInspector(vi.fn(), 'metric', {
      opening: buildOpeningOfType('double-hung-window', WINDOW_SILL_MM),
      wallHasOneRoomSide: true,
    })

    const hinge = screen.getByRole('button', { name: 'Flip hinge' })
    const sashSides = screen.getByRole('button', { name: 'Swap sash sides' })
    expect(hinge).toHaveAttribute('aria-describedby')
    expect(hinge.getAttribute('aria-describedby')).not.toBe(
      sashSides.getAttribute('aria-describedby'),
    )
    expect(hinge).toHaveAccessibleDescription(NO_HINGE_SIDE_REASON)
    expect(sashSides).not.toHaveAccessibleDescription(NO_HINGE_SIDE_REASON)
  })
})

describe('OpeningInspector hinge control on an opening with a hinge side', () => {
  it('keeps Flip hinge available for a single swing door', () => {
    renderInspector(vi.fn())

    const button = screen.getByRole('button', { name: 'Flip hinge' })
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).toHaveAccessibleDescription('')
  })

  it('dispatches a hinge flip when Flip hinge is clicked on a single swing door', async () => {
    const dispatch = vi.fn()
    renderInspector(dispatch)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Flip hinge' }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(flipOpening(FLOOR_ID, OPENING_ID, 'hinge'))
  })

  it('keeps Flip hinge available for a casement window', () => {
    renderInspector(vi.fn(), 'metric', {
      opening: buildOpeningOfType('casement-window', WINDOW_SILL_MM),
    })

    const button = screen.getByRole('button', { name: 'Flip hinge' })
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).toHaveAccessibleDescription('')
  })
})
