import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_CALIBRATION,
  diffuseLevelAt,
  directToDiffuseRatio,
  NIGHT_DIFFUSE_LEVEL,
  sunLevelAt,
} from './daylight-calibration'
import { referenceLightingInput } from './daylight-reference'
import { FROZEN_SUN_SCALE, kastenYoungFade } from './daylight-test-support'
import { computeEnvironmentLighting } from './environment-lighting'
import { predictedMatteRadiance, type MatteSurface } from './light-model'
import { solarPosition } from './solar-position'
import { linearLuminance } from '../color/contrast'

// The sun scale, the level of a sun at the zenith, is solved from the reference wall: a white
// wall of reflectance 0.85 facing south at the reference instant must return the sunlit white
// level. Everything that wall returns is linear in the sun's level at the reference height, so
// the solve is the sunlit white level over the wall's return per unit of sun scale, which is its
// return per unit of reference level times the fade at the reference height. The fade is the
// Kasten and Young one (see sun-level-fade.test.ts).
//
// The diffuse level on the level card is the sun's clear level on the card, level * sin h / pi,
// over the direct to diffuse ratio, and never falls below the night level. The crossing, the
// height where the two meet, is found here by bisection from those formulas.

const DEGREES = Math.PI / 180
const CLEAR_SKY = 0

const WALL_REFLECTANCE = 0.85
const SOUTH_FACING_WHITE_WALL: MatteSurface = {
  normal: { x: 0, y: 0, z: 1 },
  reflectance: { r: WALL_REFLECTANCE, g: WALL_REFLECTANCE, b: WALL_REFLECTANCE },
}
// The solve gives 10.91255; the scale is frozen to four decimals, so it may sit 0.0001 off.
const SCALE_TOLERANCE = 1e-4
const REFERENCE_SUN_LEVEL = 10.0056
const REFERENCE_LEVEL_TOLERANCE = 1e-4

const BISECTION_LOW = 1 * DEGREES
const BISECTION_HIGH = 45 * DEGREES
const BISECTION_STEPS = 60
const STATED_CROSSING_DEGREES = 12.19
const CROSSING_TOLERANCE_IN_DEGREES = 0.005
const OLD_CROSSING_DEGREES = 12.36
const CROSSING_MARGIN = 0.05 * DEGREES
const FLOOR_TOLERANCE = 1e-12
const DIFFUSE_RELATIVE_TOLERANCE = 1e-6

function referenceHeight(): number {
  const input = referenceLightingInput()
  return solarPosition({
    latitude: input.latLong.latitude,
    longitude: input.latLong.longitude,
    observedAt: input.observedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  }).altitude
}

/** The sun scale solved from the reference wall for the Kasten and Young fade. */
function solvedSunScale(): number {
  const lighting = computeEnvironmentLighting(referenceLightingInput())
  const wallLevel = linearLuminance(predictedMatteRadiance(lighting, SOUTH_FACING_WHITE_WALL))
  const wallLevelPerReferenceLevel = wallLevel / lighting.sunLevel
  const wallLevelPerSunScale = wallLevelPerReferenceLevel * kastenYoungFade(referenceHeight())
  return DAYLIGHT_CALIBRATION.sunlitWhiteLevel / wallLevelPerSunScale
}

/** The diffuse level on the card before the night floor, from the stated formulas. */
function unflooredDiffuseLevel(height: number): number {
  const sunOnCard = (FROZEN_SUN_SCALE * kastenYoungFade(height) * Math.sin(height)) / Math.PI
  return sunOnCard / directToDiffuseRatio(height)
}

/** The height where the unfloored diffuse level first reaches the night level. */
function nightFloorCrossing(): number {
  let low = BISECTION_LOW
  let high = BISECTION_HIGH
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const middle = (low + high) / 2
    if (unflooredDiffuseLevel(middle) < NIGHT_DIFFUSE_LEVEL) low = middle
    else high = middle
  }
  return (low + high) / 2
}

describe('the sun scale', () => {
  it('solves again from the reference wall to about 10.9126 for the Kasten and Young fade', () => {
    const solved = solvedSunScale()
    expect(Math.abs(solved - FROZEN_SUN_SCALE)).toBeLessThan(SCALE_TOLERANCE)
    expect(Math.abs(DAYLIGHT_CALIBRATION.sunScale - solved)).toBeLessThan(SCALE_TOLERANCE)
  })

  it('keeps the sun level at the reference height at 10.0056', () => {
    const level = sunLevelAt(referenceHeight(), CLEAR_SKY)
    expect(Math.abs(level - REFERENCE_SUN_LEVEL)).toBeLessThan(REFERENCE_LEVEL_TOLERANCE)
  })
})

describe('the night floor of the diffuse level', () => {
  it('stops binding at about 12.19 degrees, below the 12.36 degrees of the old fade', () => {
    const crossingDegrees = nightFloorCrossing() / DEGREES
    expect(Math.abs(crossingDegrees - STATED_CROSSING_DEGREES)).toBeLessThan(
      CROSSING_TOLERANCE_IN_DEGREES,
    )
    expect(crossingDegrees).toBeLessThan(OLD_CROSSING_DEGREES)
  })

  it('holds the diffuse level at the night level just below the crossing', () => {
    const height = nightFloorCrossing() - CROSSING_MARGIN
    const level = diffuseLevelAt(height, CLEAR_SKY)
    expect(Math.abs(level - NIGHT_DIFFUSE_LEVEL)).toBeLessThan(FLOOR_TOLERANCE)
  })

  it('lifts the diffuse level above the night level just past the crossing, as the fade gives', () => {
    const height = nightFloorCrossing() + CROSSING_MARGIN
    const expected = unflooredDiffuseLevel(height)
    const level = diffuseLevelAt(height, CLEAR_SKY)
    expect(level).toBeGreaterThan(NIGHT_DIFFUSE_LEVEL)
    expect(Math.abs(level - expected)).toBeLessThan(expected * DIFFUSE_RELATIVE_TOLERANCE)
  })
})
