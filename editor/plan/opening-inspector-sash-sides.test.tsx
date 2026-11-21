import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import { createOpening } from '../../core'
import { HEIGHT_MM, OPENING_ID, WIDTH_MM, renderInspector } from './opening-inspector-test-helpers'

const HUNG_WINDOW_SILL_MM = 900

function buildHungWindow() {
  return createOpening({
    type: 'double-hung-window',
    hostWallId: 'w1',
    position: 1000,
    width: WIDTH_MM,
    height: HEIGHT_MM,
    sillHeight: HUNG_WINDOW_SILL_MM,
    id: OPENING_ID,
  })
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
