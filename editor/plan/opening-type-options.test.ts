import { describe, expect, it } from 'vitest'

import { groupedOpeningTypes, openingTypeLabel } from './opening-type-options'

describe('groupedOpeningTypes', () => {
  it('groups every operable window under windows, including hung and sliding sashes', () => {
    const { doors, windows } = groupedOpeningTypes()
    const windowIds = windows.map((type) => type.id)
    const doorIds = doors.map((type) => type.id)

    for (const windowId of [
      'double-hung-window',
      'single-hung-window',
      'sliding-window',
      'casement-window',
      'picture-window',
    ]) {
      expect(windowIds).toContain(windowId)
      expect(doorIds).not.toContain(windowId)
    }

    expect(doorIds).toContain('single-swing-door')
    expect(windowIds).not.toContain('single-swing-door')
  })
})

describe('openingTypeLabel', () => {
  function typeById(id: string) {
    const { doors, windows } = groupedOpeningTypes()
    const found = [...doors, ...windows].find((type) => type.id === id)
    if (found === undefined) {
      throw new Error(`No opening type ${id}`)
    }
    return found
  }

  it('says what a cased opening is, since its registry name does not', () => {
    expect(openingTypeLabel(typeById('cased-opening'))).toBe('Cased Opening (open doorway)')
  })

  it('leaves a type whose registry name already reads plainly alone', () => {
    expect(openingTypeLabel(typeById('single-swing-door'))).toBe('Single Swing Door')
    expect(openingTypeLabel(typeById('double-hung-window'))).toBe('Double Hung Window')
  })
})
