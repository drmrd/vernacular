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

  it('sets the cased opening apart under passages instead of burying it among ten door types', () => {
    const { doors, windows, passages } = groupedOpeningTypes()
    const passageIds = passages.map((type) => type.id)
    const doorIds = doors.map((type) => type.id)
    const windowIds = windows.map((type) => type.id)

    expect(passageIds).toContain('cased-opening')
    expect(doorIds).not.toContain('cased-opening')
    expect(windowIds).not.toContain('cased-opening')

    for (const doorId of [
      'single-swing-door',
      'double-swing-door',
      'pocket-door',
      'barn-door',
      'bifold-door',
      'pivot-door',
    ]) {
      expect(doorIds).toContain(doorId)
    }
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
