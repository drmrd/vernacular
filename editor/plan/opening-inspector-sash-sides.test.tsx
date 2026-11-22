import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildOpeningOfType, renderInspector } from './opening-inspector-test-support'

const HUNG_WINDOW_SILL_MM = 900

function buildHungWindow() {
  return buildOpeningOfType('double-hung-window', HUNG_WINDOW_SILL_MM)
}

afterEach(cleanup)

describe('OpeningInspector sash side control', () => {
  it('labels the swing flip of a hung window "Swap sash sides"', () => {
    renderInspector(vi.fn(), 'metric', { opening: buildHungWindow() })

    expect(screen.getByRole('button', { name: 'Swap sash sides' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Flip swing' })).not.toBeInTheDocument()
  })

  it('keeps the "Flip swing" label for a door', () => {
    renderInspector(vi.fn())

    expect(screen.getByRole('button', { name: 'Flip swing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Swap sash sides' })).not.toBeInTheDocument()
  })
})

const ONE_ROOM_SIDE_REASON = 'The room side sets which way the sashes face on this wall.'

describe('OpeningInspector sash side control on a wall with one room side', () => {
  it('marks the button unavailable and gives its reason as title and description', () => {
    renderInspector(vi.fn(), 'metric', { opening: buildHungWindow(), wallHasOneRoomSide: true })

    const button = screen.getByRole('button', { name: 'Swap sash sides' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toHaveAttribute('disabled')
    expect(button).toHaveAttribute('title', ONE_ROOM_SIDE_REASON)
    expect(button).toHaveAccessibleDescription(ONE_ROOM_SIDE_REASON)
  })

  it('dispatches nothing when the unavailable button is clicked', async () => {
    const dispatch = vi.fn()
    renderInspector(dispatch, 'metric', { opening: buildHungWindow(), wallHasOneRoomSide: true })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Swap sash sides' }))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('keeps "Flip swing" available for a door on the same wall', () => {
    renderInspector(vi.fn(), 'metric', { wallHasOneRoomSide: true })

    const button = screen.getByRole('button', { name: 'Flip swing' })
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).toHaveAccessibleDescription('')
  })

  it('keeps "Swap sash sides" available when the wall does not have one room side', () => {
    renderInspector(vi.fn(), 'metric', { opening: buildHungWindow() })

    const button = screen.getByRole('button', { name: 'Swap sash sides' })
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).toHaveAccessibleDescription('')
  })
})
