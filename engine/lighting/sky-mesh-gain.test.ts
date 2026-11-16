import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { DAYLIGHT_CALIBRATION } from '../../core'
import { SKY_MESH_GAIN_BY_SUN_HEIGHT, skyMeshGain, skyMeshGainAt } from './sky-environment'

/** The measured table the contract fixes, restated so a drifted table fails here. */
const EXPECTED_ROWS = [
  { sunHeightDegrees: 1.07, gain: 1.15 },
  { sunHeightDegrees: 2.07, gain: 0.651 },
  { sunHeightDegrees: 3.58, gain: 0.353 },
  { sunHeightDegrees: 4.95, gain: 0.233 },
  { sunHeightDegrees: 7.54, gain: 0.132 },
  { sunHeightDegrees: 10.0, gain: 0.0905 },
  { sunHeightDegrees: 12.5, gain: 0.0692 },
  { sunHeightDegrees: 73.44, gain: 0.061 },
]
const FIRST_ROW_GAIN = 1.15
const LAST_ROW_GAIN = 0.061
const EXACT = 1e-12
const FINE_GRID_STEP_DEGREES = 0.05
const GRID_START_DEGREES = -10
const GRID_END_DEGREES = 90
const HALF = 0.5

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** The sun height midway between two table rows, in degrees. */
function midwayDegrees(lower: number, upper: number): number {
  return (lower + upper) * HALF
}

describe('SKY_MESH_GAIN_BY_SUN_HEIGHT', () => {
  it('holds the eight measured rows, ascending by sun height, in a frozen array', () => {
    expect(Object.isFrozen(SKY_MESH_GAIN_BY_SUN_HEIGHT)).toBe(true)
    expect(SKY_MESH_GAIN_BY_SUN_HEIGHT).toHaveLength(EXPECTED_ROWS.length)
    EXPECTED_ROWS.forEach((row, index) => {
      expect(SKY_MESH_GAIN_BY_SUN_HEIGHT[index]?.sunHeightDegrees).toBe(row.sunHeightDegrees)
      expect(SKY_MESH_GAIN_BY_SUN_HEIGHT[index]?.gain).toBe(row.gain)
    })
  })
})

describe('skyMeshGainAt', () => {
  it.each(EXPECTED_ROWS)(
    'returns the measured gain at the row for a sun $sunHeightDegrees degrees high',
    ({ sunHeightDegrees, gain }) => {
      expect(Math.abs(skyMeshGainAt(toRadians(sunHeightDegrees)) - gain)).toBeLessThan(EXACT)
    },
  )

  it.each([
    { lower: 3.58, upper: 4.95, lowerGain: 0.353, upperGain: 0.233 },
    { lower: 12.5, upper: 73.44, lowerGain: 0.0692, upperGain: 0.061 },
  ])(
    'returns the geometric mean of the gains midway between the $lower and $upper degree rows',
    ({ lower, upper, lowerGain, upperGain }) => {
      const midway = toRadians(midwayDegrees(lower, upper))

      expect(Math.abs(skyMeshGainAt(midway) - Math.sqrt(lowerGain * upperGain))).toBeLessThan(EXACT)
    },
  )

  it.each([
    ['at the horizon', 0],
    ['half a degree up, below the first row', 0.5],
    ['below the horizon', -5],
  ])('holds the first row gain for a sun %s', (_label, degrees) => {
    expect(Math.abs(skyMeshGainAt(toRadians(degrees)) - FIRST_ROW_GAIN)).toBeLessThan(EXACT)
  })

  it.each([
    ['80 degrees up', 80],
    ['at the zenith', 90],
  ])('holds the last row gain for a sun %s', (_label, degrees) => {
    expect(Math.abs(skyMeshGainAt(toRadians(degrees)) - LAST_ROW_GAIN)).toBeLessThan(EXACT)
  })

  it('never rises with the sun and stays finite and positive from -10 to 90 degrees', () => {
    const steps = Math.round((GRID_END_DEGREES - GRID_START_DEGREES) / FINE_GRID_STEP_DEGREES)
    let previous = Number.POSITIVE_INFINITY
    for (let step = 0; step <= steps; step += 1) {
      const degrees = GRID_START_DEGREES + step * FINE_GRID_STEP_DEGREES
      const gain = skyMeshGainAt(toRadians(degrees))

      expect(Number.isFinite(gain)).toBe(true)
      expect(gain).toBeGreaterThan(0)
      expect(gain).toBeLessThanOrEqual(previous)
      previous = gain
    }
  })
})

describe('skyMeshGain', () => {
  const SAMPLE_HEIGHT = toRadians(4.95)

  it("divides the height's gain by each channel of the daylight white point", () => {
    const { r, g, b } = DAYLIGHT_CALIBRATION.whitePoint
    const gain = skyMeshGainAt(SAMPLE_HEIGHT)

    const scaled = skyMeshGain(SAMPLE_HEIGHT)

    expect(Math.abs(scaled.x - gain / r)).toBeLessThan(EXACT)
    expect(Math.abs(scaled.y - gain / g)).toBeLessThan(EXACT)
    expect(Math.abs(scaled.z - gain / b)).toBeLessThan(EXACT)
  })

  it('returns a new vector on every call so a caller cannot alias another', () => {
    const first = skyMeshGain(SAMPLE_HEIGHT)

    first.set(0, 0, 0)
    const second = skyMeshGain(SAMPLE_HEIGHT)

    expect(second).toBeInstanceOf(THREE.Vector3)
    expect(second).not.toBe(first)
    expect(second.x).toBeGreaterThan(0)
  })
})
