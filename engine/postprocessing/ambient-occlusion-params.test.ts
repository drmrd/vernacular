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

// The r184 three.js GTAONode uniform initials (three/examples/jsm/tsl/display/GTAONode.js),
// with the two view-space lengths in this project's millimeters rather than the metre world
// three's examples are authored for. Which two of the six are lengths, and why, is derived
// beside the constants in ambient-occlusion-params.ts; these are the magnitudes that
// derivation has to land on, written out so the expectation does not lean on the same
// conversion call the implementation makes.
const EXPECTED_RADIUS = 250 // a quarter metre
const EXPECTED_THICKNESS = 1000 // one metre
const EXPECTED_SCALE = 1
const EXPECTED_DISTANCE_EXPONENT = 1
const EXPECTED_DISTANCE_FALL_OFF = 1
const EXPECTED_SAMPLE_COUNT = 16

// Ambient occlusion for room interiors is conventionally gathered over a quarter to half a
// metre; below that the term collapses into the contact seam and stops reading as occlusion.
const INTERIOR_RADIUS_FLOOR_MM = 250
const INTERIOR_RADIUS_CEILING_MM = 500

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

  it('gathers occlusion over an interior-scale radius in millimeters', () => {
    expect(AO_DEFAULT_PARAMS.radius).toBeGreaterThanOrEqual(INTERIOR_RADIUS_FLOOR_MM)
    expect(AO_DEFAULT_PARAMS.radius).toBeLessThanOrEqual(INTERIOR_RADIUS_CEILING_MM)
  })

  it('accepts occluders across at least the depth its sampling radius reaches', () => {
    // Samples land up to `radius` away in view space, so a genuine occluder can sit that far
    // off in depth. A thickness under the radius would reject the far half of its own samples.
    expect(AO_DEFAULT_PARAMS.thickness).toBeGreaterThanOrEqual(AO_DEFAULT_PARAMS.radius)
  })

  it('matches the r184 GTAONode defaults, with its two view-space lengths in millimeters', () => {
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
