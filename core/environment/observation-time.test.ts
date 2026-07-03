import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OBSERVATION_INSTANT,
  MINUTES_PER_DAY,
  formatObservationDateTime,
  observationInstantToIso,
  parseObservationInstant,
  type ObservationInstant,
} from './observation-time'

const NOON = 12 * 60
const QUARTER_PAST_NINE_AM = 9 * 60 + 15

describe('observation-time helpers', () => {
  it('defaults to summer-solstice noon', () => {
    expect(DEFAULT_OBSERVATION_INSTANT.date).toBe('2026-06-21')
    expect(DEFAULT_OBSERVATION_INSTANT.minutesSinceMidnight).toBe(NOON)
  })

  it('spans a full day in minutes', () => {
    expect(MINUTES_PER_DAY).toBe(1440)
  })

  it('serializes to a zero-padded ISO 8601 civil datetime', () => {
    const instant: ObservationInstant = {
      date: '2026-06-21',
      minutesSinceMidnight: QUARTER_PAST_NINE_AM,
    }
    expect(observationInstantToIso(instant)).toBe('2026-06-21T09:15')
  })

  it('serializes midnight as 00:00', () => {
    expect(observationInstantToIso({ date: '2026-01-01', minutesSinceMidnight: 0 })).toBe(
      '2026-01-01T00:00',
    )
  })

  it('round-trips through parse', () => {
    const instant: ObservationInstant = { date: '2026-12-04', minutesSinceMidnight: 16 * 60 }
    expect(parseObservationInstant(observationInstantToIso(instant))).toEqual(instant)
  })

  it('parses a datetime-local input string', () => {
    expect(parseObservationInstant('2026-03-20T06:30')).toEqual({
      date: '2026-03-20',
      minutesSinceMidnight: 6 * 60 + 30,
    })
  })

  it('formats a readable readout', () => {
    expect(formatObservationDateTime({ date: '2026-06-21', minutesSinceMidnight: NOON })).toBe(
      '2026-06-21 12:00',
    )
  })
})
