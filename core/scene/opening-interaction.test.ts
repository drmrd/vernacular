import { describe, expect, it } from 'vitest'

import { emptyOpeningInteraction, isOpeningOpen, toggleOpening } from './opening-interaction'

describe('opening interaction view-state', () => {
  it('starts with every opening closed', () => {
    const state = emptyOpeningInteraction()

    expect(isOpeningOpen(state, 'opening:front-door')).toBe(false)
  })

  it('toggling a closed opening marks it open without mutating the prior state', () => {
    const closed = emptyOpeningInteraction()

    const opened = toggleOpening(closed, 'opening:front-door')

    expect(isOpeningOpen(opened, 'opening:front-door')).toBe(true)
    // The original state is untouched, so view-state stays immutable like the walk state.
    expect(isOpeningOpen(closed, 'opening:front-door')).toBe(false)
  })

  it('toggling an open opening closes it again', () => {
    const opened = toggleOpening(emptyOpeningInteraction(), 'opening:front-door')

    const reclosed = toggleOpening(opened, 'opening:front-door')

    expect(isOpeningOpen(reclosed, 'opening:front-door')).toBe(false)
  })

  it('tracks each opening independently', () => {
    const oneOpen = toggleOpening(emptyOpeningInteraction(), 'opening:front-door')

    expect(isOpeningOpen(oneOpen, 'opening:front-door')).toBe(true)
    expect(isOpeningOpen(oneOpen, 'opening:back-door')).toBe(false)
  })
})
