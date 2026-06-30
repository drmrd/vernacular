import { describe, expect, it } from 'vitest'

import { groupedOpeningTypes } from './opening-type-options'

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
