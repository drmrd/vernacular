import { describe, expect, it } from 'vitest'

import {
  emptyOpeningInteraction,
  isOpeningOpen,
  toggleOpening,
  type OpeningPartRef,
} from '../index'

function primaryPartOf(openingId: string): OpeningPartRef {
  return { openingId, part: 'primary' }
}

describe('opening interaction view-state', () => {
  it('starts with every opening closed', () => {
    const state = emptyOpeningInteraction()

    expect(isOpeningOpen(state, 'opening:front-door')).toBe(false)
  })

  it('toggling a closed opening marks it open without mutating the prior state', () => {
    const closed = emptyOpeningInteraction()

    const opened = toggleOpening(closed, primaryPartOf('opening:front-door'))

    expect(isOpeningOpen(opened, 'opening:front-door')).toBe(true)
    // The original state is untouched, so view-state stays immutable like the walk state.
    expect(isOpeningOpen(closed, 'opening:front-door')).toBe(false)
  })

  it('toggling an open opening closes it again', () => {
    const opened = toggleOpening(emptyOpeningInteraction(), primaryPartOf('opening:front-door'))

    const reclosed = toggleOpening(opened, primaryPartOf('opening:front-door'))

    expect(isOpeningOpen(reclosed, 'opening:front-door')).toBe(false)
  })

  it('tracks each opening independently', () => {
    const oneOpen = toggleOpening(emptyOpeningInteraction(), primaryPartOf('opening:front-door'))

    expect(isOpeningOpen(oneOpen, 'opening:front-door')).toBe(true)
    expect(isOpeningOpen(oneOpen, 'opening:back-door')).toBe(false)
  })

  it('opens one sash by its part and shuts it again', () => {
    const closed = emptyOpeningInteraction()

    const upperOpen = toggleOpening(closed, { openingId: 'w', part: 'upper' })
    const shut = toggleOpening(upperOpen, { openingId: 'w', part: 'upper' })

    expect(upperOpen.openParts.get('w')).toEqual(new Set(['upper']))
    expect(isOpeningOpen(shut, 'w')).toBe(false)
    expect(closed.openParts.size).toBe(0)
  })
})
