import { describe, expect, it } from 'vitest'
import { formatLength } from './format-length'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  lengthFormatOptions,
} from './preferences'

describe('lengthFormatOptions resolving preferences', () => {
  it('resolves the imperial defaults to feet-and-inches with eighth-inch fractions', () => {
    expect(lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES)).toEqual({
      system: 'imperial',
      form: 'feet-and-inches',
      precision: { kind: 'fraction', denominator: 8 },
    })
  })

  it('resolves the metric defaults to whole millimeters', () => {
    expect(lengthFormatOptions(DEFAULT_METRIC_PREFERENCES)).toEqual({
      system: 'metric',
      form: 'millimeters',
      precision: { kind: 'decimal-places', places: 0 },
    })
  })

  it('resolves a decimal imperial form using its decimal-places precision', () => {
    expect(
      lengthFormatOptions({
        ...DEFAULT_IMPERIAL_PREFERENCES,
        imperialForm: 'decimal-feet',
        imperialLengthPrecision: { kind: 'decimal-places', places: 3 },
      }),
    ).toEqual({
      system: 'imperial',
      form: 'decimal-feet',
      precision: { kind: 'decimal-places', places: 3 },
    })
  })

  it('produces options the formatter consumes directly', () => {
    expect(formatLength(2030, lengthFormatOptions(DEFAULT_METRIC_PREFERENCES))).toBe('2030 mm')
  })
})

describe('lengthFormatOptions rejecting a fraction where it cannot apply', () => {
  it('rejects a fraction precision on a decimal imperial form', () => {
    expect(() =>
      lengthFormatOptions({
        ...DEFAULT_IMPERIAL_PREFERENCES,
        imperialForm: 'decimal-inches',
        imperialLengthPrecision: { kind: 'fraction', denominator: 8 },
      }),
    ).toThrow(/decimal-places/)
  })

  it('rejects a fraction precision on a metric form', () => {
    expect(() =>
      lengthFormatOptions({
        ...DEFAULT_METRIC_PREFERENCES,
        metricLengthPrecision: { kind: 'fraction', denominator: 8 },
      }),
    ).toThrow(/decimal-places/)
  })
})
