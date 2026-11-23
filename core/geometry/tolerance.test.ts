import { describe, expect, it } from 'vitest'
import * as core from '../index'
import {
  ANGLE_TOLERANCE_RAD,
  CAP_AREA_LIMIT_MM2,
  CROSS_PRODUCT_PARALLEL_LIMIT,
  DEFAULT_JUNCTION_TOLERANCE_MM,
  DEGENERATE_SQUARED_LENGTH_MM2,
  DERIVATION_LENGTH_TOLERANCE_MM,
  DERIVED_COORDINATE_GRID_MM,
  FILL_CORNER_MATCH_MM,
  FRONT_DIRECTION_TIE,
  GROUND_PICK_TIE_MM,
  JOIN_DISTANCE_MM,
  LENGTH_TOLERANCE_MM,
  MIN_FACE_AREA_MM2,
  OUTLINE_TOLERANCE_MM,
  REACH_RAY_PARALLEL_LIMIT,
  ROOM_RING_TOLERANCE_MM,
  SMALLEST_IMPERIAL_DISPLAY_STEP_MM,
  SMALLEST_METRIC_DISPLAY_STEP_MM,
  SNAP_UNITS_PER_MM,
  SUPPORTED_EXTENT_MM,
  UNIT_NORMAL_DOT_LIMIT,
  VOID_SAME_POINT_MM,
  WALK_CONTACT_MM,
  WALL_BOUNDARY_MATCH_MM,
  WALL_FACE_DEGENERATE_LENGTH_MM,
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

  it('snaps offset corners to a million units per millimeter', () => {
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

const todaysEntries = [
  { name: 'CROSS_PRODUCT_PARALLEL_LIMIT', value: 1e-9, actual: CROSS_PRODUCT_PARALLEL_LIMIT },
  { name: 'REACH_RAY_PARALLEL_LIMIT', value: 1e-9, actual: REACH_RAY_PARALLEL_LIMIT },
  { name: 'DEGENERATE_SQUARED_LENGTH_MM2', value: 1e-9, actual: DEGENERATE_SQUARED_LENGTH_MM2 },
  { name: 'MIN_FACE_AREA_MM2', value: 1, actual: MIN_FACE_AREA_MM2 },
  { name: 'FILL_CORNER_MATCH_MM', value: 1e-6, actual: FILL_CORNER_MATCH_MM },
  { name: 'VOID_SAME_POINT_MM', value: 1e-9, actual: VOID_SAME_POINT_MM },
  { name: 'WALK_CONTACT_MM', value: 1e-6, actual: WALK_CONTACT_MM },
  { name: 'FRONT_DIRECTION_TIE', value: 1e-9, actual: FRONT_DIRECTION_TIE },
  { name: 'WALL_BOUNDARY_MATCH_MM', value: 1e-6, actual: WALL_BOUNDARY_MATCH_MM },
  { name: 'CAP_AREA_LIMIT_MM2', value: 1e-6, actual: CAP_AREA_LIMIT_MM2 },
  { name: 'WALL_FACE_DEGENERATE_LENGTH_MM', value: 1e-9, actual: WALL_FACE_DEGENERATE_LENGTH_MM },
  { name: 'UNIT_NORMAL_DOT_LIMIT', value: 1e-9, actual: UNIT_NORMAL_DOT_LIMIT },
  { name: 'GROUND_PICK_TIE_MM', value: 1, actual: GROUND_PICK_TIE_MM },
]

describe("today's geometric constants in the tolerance module", () => {
  it('sets the join distance to 1 mm', () => {
    expect(JOIN_DISTANCE_MM).toBe(1)
  })

  it('ties the graph merge distance, the derivation length, and the room ring to the join distance', () => {
    for (const distance of [
      DEFAULT_JUNCTION_TOLERANCE_MM,
      DERIVATION_LENGTH_TOLERANCE_MM,
      ROOM_RING_TOLERANCE_MM,
    ]) {
      expect(distance).toBe(JOIN_DISTANCE_MM)
      expect(distance).toBe(1)
    }
  })

  it('keeps the daylight outline distance at 1 mm', () => {
    expect(OUTLINE_TOLERANCE_MM).toBe(1)
  })

  it.each(todaysEntries)("keeps $name at today's value $value", ({ actual, value }) => {
    expect(actual).toBe(value)
  })

  it('exports the named entries from core', () => {
    const namedEntries = [
      { name: 'JOIN_DISTANCE_MM', actual: JOIN_DISTANCE_MM },
      { name: 'DERIVATION_LENGTH_TOLERANCE_MM', actual: DERIVATION_LENGTH_TOLERANCE_MM },
      { name: 'DEFAULT_JUNCTION_TOLERANCE_MM', actual: DEFAULT_JUNCTION_TOLERANCE_MM },
      { name: 'ROOM_RING_TOLERANCE_MM', actual: ROOM_RING_TOLERANCE_MM },
      { name: 'OUTLINE_TOLERANCE_MM', actual: OUTLINE_TOLERANCE_MM },
      ...todaysEntries,
    ]
    const exports: Record<string, unknown> = core
    for (const { name, actual } of namedEntries) {
      expect(actual, name).toBeTypeOf('number')
      expect(exports[name], name).toBe(actual)
    }
  })
})
