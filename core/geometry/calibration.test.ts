import { describe, expect, it } from 'vitest'
import { calibrationScale } from './calibration'
import { distance } from './point'

// Decimal places for toBeCloseTo: the round trip should reproduce the known
// distance near-exactly, far tighter than the 1% calibration target.
const ROUND_TRIP_DECIMAL_PLACES = 6

describe('calibrationScale', () => {
  it('returns millimeters-per-pixel for a horizontal pixel segment', () => {
    expect(calibrationScale({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, 1000)).toBe(10)
  })

  it('uses the straight-line pixel length for a diagonal segment', () => {
    expect(calibrationScale({ start: { x: 0, y: 0 }, end: { x: 3, y: 4 } }, 2500)).toBeCloseTo(
      2500 / 5,
    )
  })

  it('round-trips the scale back to the known distance within tolerance', () => {
    const segment = { start: { x: 0, y: 0 }, end: { x: 3, y: 4 } }
    const knownDistanceMm = 2500
    const pixelLength = distance(segment.start, segment.end)

    expect(calibrationScale(segment, knownDistanceMm) * pixelLength).toBeCloseTo(
      knownDistanceMm,
      ROUND_TRIP_DECIMAL_PLACES,
    )
  })

  it('throws for a zero-length segment whose endpoints coincide', () => {
    expect(() => calibrationScale({ start: { x: 5, y: 5 }, end: { x: 5, y: 5 } }, 1000)).toThrow()
  })

  it('throws for a zero known distance', () => {
    expect(() => calibrationScale({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, 0)).toThrow()
  })

  it('throws for a negative known distance', () => {
    expect(() => calibrationScale({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, -50)).toThrow()
  })
})
