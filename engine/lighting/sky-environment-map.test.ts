import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

import { evaluateSphericalHarmonics, SH_COEFFICIENT_COUNT, type Vector3 } from '../../core'

import {
  createSkyEnvironmentTexture,
  writeSkyEnvironmentTexture,
  SKY_ENVIRONMENT_WIDTH,
  SKY_ENVIRONMENT_HEIGHT,
} from './sky-environment-map'

/** A band-0 term large enough to hold the reconstructed field positive everywhere, so the
 *  reconstruction assertions below compare against real radiance rather than the clamp. */
const DOMINANT_BAND_0 = 3
/**
 * Twenty-seven distinct coefficients, so every band contributes and a texel that
 * ignored the higher bands (or transposed a direction component) reads visibly wrong.
 * The three band-0 channels dominate (see above); the rest stay small and distinct.
 */
const DISTINCT_SKY_AMBIENT: readonly number[] = Array.from(
  { length: SH_COEFFICIENT_COUNT },
  (_, index) => (index < 3 ? DOMINANT_BAND_0 : (index + 1) / 100),
)

/**
 * Comparisons run against the half-float round-trip of the expected value, so storage
 * quantization (a 10-bit mantissa, about 5e-4 of absolute error near 1.0) is taken out of
 * the comparison and what remains under test is the reconstruction itself.
 */
const HALF_FLOAT_PRECISION = 5

/** The value a channel takes once stored in the map's half-float buffer. */
function asStored(channel: number): number {
  return THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(channel))
}

/**
 * The direction three samples an equirectangular environment texel from, inverted from
 * `equirectUV` in three r184 (node_modules/three/src/nodes/utils/EquirectUV.js):
 *   u = atan2(z, x) / 2pi + 0.5,  v = asin(y) / pi + 0.5
 * A DataTexture is not y-flipped, so data row 0 is v = 0, which is straight down.
 * Writing the inverse out here pins the convention independently of the module.
 */
function directionOfTexel(column: number, row: number): Vector3 {
  const v = (row + 0.5) / SKY_ENVIRONMENT_HEIGHT
  const u = (column + 0.5) / SKY_ENVIRONMENT_WIDTH
  const elevation = (v - 0.5) * Math.PI
  const azimuth = (u - 0.5) * 2 * Math.PI
  const horizontalRadius = Math.cos(elevation)
  return {
    x: horizontalRadius * Math.cos(azimuth),
    y: Math.sin(elevation),
    z: horizontalRadius * Math.sin(azimuth),
  }
}

/** Reads one texel's linear RGB back out of the half-float RGBA buffer. */
function texelRadiance(texture: THREE.DataTexture, column: number, row: number): Vector3 {
  const data = texture.image.data as Uint16Array
  const offset = (row * SKY_ENVIRONMENT_WIDTH + column) * 4
  return {
    x: THREE.DataUtils.fromHalfFloat(data[offset]!),
    y: THREE.DataUtils.fromHalfFloat(data[offset + 1]!),
    z: THREE.DataUtils.fromHalfFloat(data[offset + 2]!),
  }
}

describe('createSkyEnvironmentTexture', () => {
  it('allocates a linear half-float equirectangular map three can PMREM-filter', () => {
    const texture = createSkyEnvironmentTexture()

    // Equirectangular mapping is what routes the texture through three's PMREM
    // conversion when it is assigned to scene.environment; the linear color space
    // and float type keep it a radiance map rather than a display-encoded image.
    expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping)
    expect(texture.colorSpace).toBe(THREE.LinearSRGBColorSpace)
    expect(texture.type).toBe(THREE.HalfFloatType)
    expect(texture.image.width).toBe(SKY_ENVIRONMENT_WIDTH)
    expect(texture.image.height).toBe(SKY_ENVIRONMENT_HEIGHT)
    // Three sizes the PMREM cube face at width / 4, and its filtered chain needs a
    // face of at least 2^LOD_MIN (16) texels, so the width may not drop below 64.
    expect(SKY_ENVIRONMENT_WIDTH / 4).toBeGreaterThanOrEqual(16)
    // A 2:1 equirectangular aspect: one full turn across, half a turn down.
    expect(SKY_ENVIRONMENT_WIDTH).toBe(SKY_ENVIRONMENT_HEIGHT * 2)
  })

  it('starts filtering-friendly and unfiltered-black rather than undefined', () => {
    const texture = createSkyEnvironmentTexture()

    expect(texture.magFilter).toBe(THREE.LinearFilter)
    expect(texture.minFilter).toBe(THREE.LinearFilter)
    expect(texelRadiance(texture, 0, 0)).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('writeSkyEnvironmentTexture', () => {
  it('reconstructs the sky-ambient harmonics into every texel of the map', () => {
    const texture = createSkyEnvironmentTexture()

    writeSkyEnvironmentTexture(texture, DISTINCT_SKY_AMBIENT)

    // Sample the four corners plus the middle: a texel that used the wrong row, the
    // wrong turn direction, or dropped the azimuth would disagree at one of these.
    const probes = [
      { column: 0, row: 0 },
      { column: SKY_ENVIRONMENT_WIDTH - 1, row: 0 },
      { column: 0, row: SKY_ENVIRONMENT_HEIGHT - 1 },
      { column: SKY_ENVIRONMENT_WIDTH - 1, row: SKY_ENVIRONMENT_HEIGHT - 1 },
      { column: SKY_ENVIRONMENT_WIDTH / 2, row: SKY_ENVIRONMENT_HEIGHT / 2 },
    ]
    for (const { column, row } of probes) {
      const expected = evaluateSphericalHarmonics(
        DISTINCT_SKY_AMBIENT,
        directionOfTexel(column, row),
      )
      const actual = texelRadiance(texture, column, row)
      // Guards the comparison itself: a probe that reconstructed to zero or below
      // would be satisfied by the clamp alone and would pin nothing about the field.
      expect(expected.r).toBeGreaterThan(0)
      expect(actual.x).toBeCloseTo(asStored(expected.r), HALF_FLOAT_PRECISION)
      expect(actual.y).toBeCloseTo(asStored(expected.g), HALF_FLOAT_PRECISION)
      expect(actual.z).toBeCloseTo(asStored(expected.b), HALF_FLOAT_PRECISION)
    }
  })

  it('clamps a negatively ringing reconstruction up to zero radiance', () => {
    const texture = createSkyEnvironmentTexture()
    // A band-1 y coefficient far larger than the band-0 average drives the order-2
    // reconstruction negative over the lower hemisphere: the basis is proportional to
    // y, which is negative below the horizon. Negative radiance is not a colour any
    // filter can carry, so the map must clamp rather than store it.
    const ringing = new Array<number>(SH_COEFFICIENT_COUNT).fill(0)
    ringing[0] = 0.1
    ringing[1] = 0.1
    ringing[2] = 0.1
    ringing[3] = 5
    ringing[4] = 5
    ringing[5] = 5

    writeSkyEnvironmentTexture(texture, ringing)

    const belowHorizon = texelRadiance(texture, 0, 0)
    const unclamped = evaluateSphericalHarmonics(ringing, directionOfTexel(0, 0))
    expect(unclamped.r).toBeLessThan(0)
    expect(belowHorizon).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('marks the map for re-upload and for PMREM regeneration', () => {
    const texture = createSkyEnvironmentTexture()
    const pmremVersionBefore = texture.pmremVersion
    const uploadVersionBefore = texture.version

    writeSkyEnvironmentTexture(texture, DISTINCT_SKY_AMBIENT)

    // `needsUpdate` is a write-only setter in three (it increments `version`), so the
    // re-upload is observed through the version counter it moves.
    expect(texture.version).toBeGreaterThan(uploadVersionBefore)
    // Three regenerates the filtered environment only when pmremVersion moves, and
    // reuses the existing render target when it does, so bumping it is both what
    // refreshes the reflection and what keeps the GPU target from churning.
    expect(texture.pmremVersion).toBeGreaterThan(pmremVersionBefore)
  })
})
