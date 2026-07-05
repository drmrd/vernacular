import { describe, expect, it } from 'vitest'
import type { LightingMode } from '../../core'
import { AO_DEFAULT_PARAMS, ambientOcclusionParamsFor } from './ambient-occlusion-params'

const AO_PARAM_FIELDS = [
  'radius',
  'scale',
  'thickness',
  'distanceExponent',
  'distanceFallOff',
  'sampleCount',
] as const

// Pinned to the r184 three.js GTAONode uniform initials
// (three/examples/jsm/tsl/display/GTAONode.js).
const EXPECTED_RADIUS = 0.25
const EXPECTED_SCALE = 1
const EXPECTED_THICKNESS = 1
const EXPECTED_DISTANCE_EXPONENT = 1
const EXPECTED_DISTANCE_FALL_OFF = 1
const EXPECTED_SAMPLE_COUNT = 16

describe('AO_DEFAULT_PARAMS', () => {
  it('carries exactly the tuning fields the r184 GTAONode surface exposes', () => {
    expect(Object.keys(AO_DEFAULT_PARAMS).sort()).toStrictEqual([...AO_PARAM_FIELDS].sort())
  })

  it.each(AO_PARAM_FIELDS)('has a finite %s', (field) => {
    expect(Number.isFinite(AO_DEFAULT_PARAMS[field])).toBe(true)
  })

  it('has a positive integer sampleCount', () => {
    expect(Number.isInteger(AO_DEFAULT_PARAMS.sampleCount)).toBe(true)
    expect(AO_DEFAULT_PARAMS.sampleCount).toBeGreaterThan(0)
  })

  it('has a positive radius', () => {
    expect(AO_DEFAULT_PARAMS.radius).toBeGreaterThan(0)
  })

  it('has a positive scale', () => {
    expect(AO_DEFAULT_PARAMS.scale).toBeGreaterThan(0)
  })

  it('has a positive thickness', () => {
    expect(AO_DEFAULT_PARAMS.thickness).toBeGreaterThan(0)
  })

  it('has a positive distanceExponent', () => {
    expect(AO_DEFAULT_PARAMS.distanceExponent).toBeGreaterThan(0)
  })

  it('has a positive distanceFallOff', () => {
    expect(AO_DEFAULT_PARAMS.distanceFallOff).toBeGreaterThan(0)
  })

  it('matches the r184 GTAONode default tuning values', () => {
    expect(AO_DEFAULT_PARAMS).toStrictEqual({
      radius: EXPECTED_RADIUS,
      scale: EXPECTED_SCALE,
      thickness: EXPECTED_THICKNESS,
      distanceExponent: EXPECTED_DISTANCE_EXPONENT,
      distanceFallOff: EXPECTED_DISTANCE_FALL_OFF,
      sampleCount: EXPECTED_SAMPLE_COUNT,
    })
  })
})

describe('ambientOcclusionParamsFor', () => {
  it('returns the default AO tuning params for realistic mode', () => {
    const mode: LightingMode = 'realistic'

    expect(ambientOcclusionParamsFor(mode)).toBe(AO_DEFAULT_PARAMS)
  })

  it('returns null for schematic mode, which never runs the AO pass', () => {
    const mode: LightingMode = 'schematic'

    expect(ambientOcclusionParamsFor(mode)).toBeNull()
  })
})
