import { describe, expect, it } from 'vitest'
import { formatLength } from './format-length'

describe('formatLength metric forms', () => {
  it('renders meters with the requested decimal places', () => {
    expect(
      formatLength(2030, {
        system: 'metric',
        form: 'meters',
        precision: { kind: 'decimal-places', places: 2 },
      }),
    ).toBe('2.03 m')
  })

  it('renders millimeters as a whole number when zero places are requested', () => {
    expect(
      formatLength(2030, {
        system: 'metric',
        form: 'millimeters',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe('2030 mm')
  })

  it('renders centimeters as a whole number when zero places are requested', () => {
    expect(
      formatLength(2030, {
        system: 'metric',
        form: 'centimeters',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe('203 cm')
  })

  it('renders meters to three decimal places without floating-point drift', () => {
    expect(
      formatLength(2032, {
        system: 'metric',
        form: 'meters',
        precision: { kind: 'decimal-places', places: 3 },
      }),
    ).toBe('2.032 m')
  })

  it('renders zero without a sign', () => {
    expect(
      formatLength(0, {
        system: 'metric',
        form: 'millimeters',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe('0 mm')
  })

  it('preserves the sign of a negative length', () => {
    expect(
      formatLength(-2030, {
        system: 'metric',
        form: 'millimeters',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe('-2030 mm')
  })
})

describe('formatLength imperial decimal forms', () => {
  it('renders decimal feet with the requested decimal places', () => {
    expect(
      formatLength(2032, {
        system: 'imperial',
        form: 'decimal-feet',
        precision: { kind: 'decimal-places', places: 3 },
      }),
    ).toBe("6.667'")
  })

  it('renders decimal inches as a whole number when zero places are requested', () => {
    expect(
      formatLength(2032, {
        system: 'imperial',
        form: 'decimal-inches',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe('80"')
  })

  it('renders decimal inches to one decimal place', () => {
    expect(
      formatLength(2044.7, {
        system: 'imperial',
        form: 'decimal-inches',
        precision: { kind: 'decimal-places', places: 1 },
      }),
    ).toBe('80.5"')
  })

  it('keeps trailing zeros in decimal feet to the requested places', () => {
    expect(
      formatLength(1828.8, {
        system: 'imperial',
        form: 'decimal-feet',
        precision: { kind: 'decimal-places', places: 2 },
      }),
    ).toBe("6.00'")
  })

  it('preserves the sign of a negative length in decimal inches', () => {
    expect(
      formatLength(-2032, {
        system: 'imperial',
        form: 'decimal-inches',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe('-80"')
  })
})

describe('formatLength imperial feet-and-inches', () => {
  it('renders whole feet and whole inches', () => {
    expect(
      formatLength(2032, {
        system: 'imperial',
        form: 'feet-and-inches',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe(`6'8"`)
  })

  it('renders a decimal inch part to the requested places', () => {
    expect(
      formatLength(2044.7, {
        system: 'imperial',
        form: 'feet-and-inches',
        precision: { kind: 'decimal-places', places: 1 },
      }),
    ).toBe(`6'8.5"`)
  })

  it('drops a zero inch part, leaving only the feet', () => {
    expect(
      formatLength(1828.8, {
        system: 'imperial',
        form: 'feet-and-inches',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe(`6'`)
  })

  it('drops a zero feet part, leaving only the inches', () => {
    expect(
      formatLength(203.2, {
        system: 'imperial',
        form: 'feet-and-inches',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe(`8"`)
  })

  it('renders zero as zero inches without a sign', () => {
    expect(
      formatLength(0, {
        system: 'imperial',
        form: 'feet-and-inches',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe(`0"`)
  })

  it('preserves the sign of a negative length and drops the zero inch part', () => {
    expect(
      formatLength(-2438.4, {
        system: 'imperial',
        form: 'feet-and-inches',
        precision: { kind: 'decimal-places', places: 0 },
      }),
    ).toBe(`-8'`)
  })
})
