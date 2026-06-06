import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  formatLength,
  lengthFormatOptions,
  parseLength,
} from '../index'

describe('the units public surface reached through the core barrel', () => {
  it('formats the imperial default as feet-and-inches to the nearest eighth inch', () => {
    expect(formatLength(2032, lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES))).toBe(`6'8"`)
  })

  it('exposes parseLength and formatLength as working callables through the barrel', () => {
    // Deep round-trip coverage lives in core/units/round-trip.test.ts; this case only
    // confirms that parseLength and formatLength are reachable and working through the barrel.
    expect(parseLength(formatLength(2032, lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES)))).toBe(
      2032,
    )
  })

  it('formats the metric default as whole millimeters', () => {
    expect(formatLength(2030, lengthFormatOptions(DEFAULT_METRIC_PREFERENCES))).toBe('2030 mm')
  })
})
