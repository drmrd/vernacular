import { describe, expect, it } from 'vitest'

import { doorFamilyOfType, openingKindOfType } from './opening-kind'

describe('openingKindOfType', () => {
  it('classifies the split operable windows as windows', () => {
    for (const id of ['double-hung-window', 'single-hung-window', 'sliding-window']) {
      expect(openingKindOfType(id)).toBe('window')
    }
  })

  it('keeps the sliding and pocket doors classified as doors after the split', () => {
    for (const id of ['pocket-door', 'sliding-glass-door', 'bypass-door', 'barn-door']) {
      expect(openingKindOfType(id)).toBe('door')
    }
  })
})

describe('doorFamilyOfType', () => {
  it.each([
    ['single-swing-door', 'swing'],
    ['french-door', 'swing'],
    ['pivot-door', 'pivot'],
    ['sliding-glass-door', 'slide'],
    ['bypass-door', 'slide'],
    ['barn-door', 'slide'],
    ['pocket-door', 'slide'],
    ['bifold-door', 'fold'],
    ['cased-opening', 'cased'],
  ])('gives the %s the %s family', (typeId, family) => {
    expect(doorFamilyOfType(typeId)).toBe(family)
  })

  it('gives a window type and an unknown id no door family', () => {
    expect(doorFamilyOfType('double-hung-window')).toBeUndefined()
    expect(doorFamilyOfType('no-such-type')).toBeUndefined()
  })
})
