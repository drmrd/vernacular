import { describe, expect, it } from 'vitest'

import { openingKindOfType } from './opening-kind'

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
