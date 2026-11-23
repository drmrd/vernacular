import { describe, expect, it } from 'vitest'
import * as core from '../index'
import {
  ANGLE_TOLERANCE_RAD,
  DERIVED_COORDINATE_GRID_MM,
  LENGTH_TOLERANCE_MM,
  SMALLEST_IMPERIAL_DISPLAY_STEP_MM,
  SMALLEST_METRIC_DISPLAY_STEP_MM,
  SNAP_UNITS_PER_MM,
  SUPPORTED_EXTENT_MM,
} from './tolerance'

describe('the derived tolerance values', () => {
  it('sets the length tolerance to 0.001 mm', () => {
    expect(LENGTH_TOLERANCE_MM).toBe(0.001)
  })

  it('sets the angle tolerance to 1e-8 radians', () => {
    expect(ANGLE_TOLERANCE_RAD).toBe(1e-8)
  })

  it('puts the derived coordinate grid at one thousandth of the length tolerance', () => {
    expect(Math.abs(DERIVED_COORDINATE_GRID_MM - 1e-6)).toBeLessThan(1e-18)
  })

  it('snaps offset corners to a million units per millimetre', () => {
    expect(SNAP_UNITS_PER_MM).toBe(1e6)
    expect(SNAP_UNITS_PER_MM).toBe(1 / DERIVED_COORDINATE_GRID_MM)
  })

  it('keeps the smallest imperial display step more than 99 tolerances wide', () => {
    expect(SMALLEST_IMPERIAL_DISPLAY_STEP_MM).toBe(25.4 / 256)
    expect(SMALLEST_IMPERIAL_DISPLAY_STEP_MM / LENGTH_TOLERANCE_MM).toBeGreaterThan(99)
  })

  it('keeps the smallest metric display step 100 tolerances wide', () => {
    expect(SMALLEST_METRIC_DISPLAY_STEP_MM).toBe(0.1)
    expect(SMALLEST_METRIC_DISPLAY_STEP_MM / LENGTH_TOLERANCE_MM).toBe(100)
  })

  it('keeps 10,000 roundings at the supported extent a hundred times below the tolerance', () => {
    expect(SUPPORTED_EXTENT_MM).toBe(1_000_000)
    expect(SUPPORTED_EXTENT_MM * Number.EPSILON * 10_000).toBeLessThan(LENGTH_TOLERANCE_MM / 100)
  })

  it('turns the angle tolerance into one length tolerance over 100 m', () => {
    expect(Math.abs(100_000 * ANGLE_TOLERANCE_RAD - LENGTH_TOLERANCE_MM)).toBeLessThan(1e-15)
  })

  it('exports the derived values from core', () => {
    const derivedValues: readonly (readonly [string, number])[] = [
      ['LENGTH_TOLERANCE_MM', LENGTH_TOLERANCE_MM],
      ['ANGLE_TOLERANCE_RAD', ANGLE_TOLERANCE_RAD],
      ['DERIVED_COORDINATE_GRID_MM', DERIVED_COORDINATE_GRID_MM],
      ['SNAP_UNITS_PER_MM', SNAP_UNITS_PER_MM],
      ['SUPPORTED_EXTENT_MM', SUPPORTED_EXTENT_MM],
      ['SMALLEST_IMPERIAL_DISPLAY_STEP_MM', SMALLEST_IMPERIAL_DISPLAY_STEP_MM],
      ['SMALLEST_METRIC_DISPLAY_STEP_MM', SMALLEST_METRIC_DISPLAY_STEP_MM],
    ]
    const exports: Record<string, unknown> = core
    for (const [name, value] of derivedValues) {
      expect(exports[name], name).toBe(value)
    }
  })
})
