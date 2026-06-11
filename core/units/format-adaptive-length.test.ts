import { describe, expect, it } from 'vitest'
import { formatAdaptiveLength } from './format-adaptive-length'
import { formatLength } from './format-length'
import { DEFAULT_IMPERIAL_PREFERENCES, DEFAULT_METRIC_PREFERENCES } from './preferences'

describe('formatAdaptiveLength', () => {
  it('picks meters, centimeters, or millimeters by magnitude in metric', () => {
    const prefs = DEFAULT_METRIC_PREFERENCES
    expect(formatAdaptiveLength(3000, prefs)).toBe('3.00 m')
    expect(formatAdaptiveLength(2500, prefs)).toBe('2.50 m')
    expect(formatAdaptiveLength(900, prefs)).toBe('90.0 cm')
    expect(formatAdaptiveLength(150, prefs)).toBe('15.0 cm')
    expect(formatAdaptiveLength(80, prefs)).toBe('80 mm')
    expect(formatAdaptiveLength(0, prefs)).toBe('0 mm')
  })

  it('uses the magnitude for the form choice with negatives', () => {
    expect(formatAdaptiveLength(-3000, DEFAULT_METRIC_PREFERENCES)).toBe('-3.00 m')
  })

  it('formats imperial as feet and inches, matching the explicit form', () => {
    const prefs = DEFAULT_IMPERIAL_PREFERENCES
    expect(formatAdaptiveLength(1219, prefs)).toBe(
      formatLength(1219, {
        system: 'imperial',
        form: 'feet-and-inches',
        precision: prefs.imperialLengthPrecision,
      }),
    )
  })
})
