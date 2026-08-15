import * as THREE from 'three'

import { evaluateSphericalHarmonics } from '../../core'

/**
 * The sky's specular environment: an equirectangular radiance map rebuilt from the same
 * spherical-harmonic sky ambient the diffuse term already carries. Assigning it to
 * `scene.environment` is what gives physical materials something to reflect, so a gloss
 * finish separates from a matte one (ADR-0161).
 *
 * Nothing here is a world length. A reflected environment is treated as infinitely far
 * away, so the map is scale-free and the millimeter world (ADR-0158) never enters it; the
 * sizes below count texels and the values are linear-light radiance.
 */

/** Three sizes the PMREM cube face at a quarter of the equirectangular width. */
export const PMREM_CUBE_FACE_DIVISOR = 4
/**
 * The smallest cube face three's PMREM chain accepts, `2 ** LOD_MIN` with the r184
 * `LOD_MIN` of 4. Below it the filtered chain (`lodMax - LOD_MIN + 1` levels plus the six
 * extra-sigma levels) runs out of levels to blur into.
 */
export const PMREM_MIN_CUBE_FACE_TEXELS = 16
/**
 * The map's width in texels, set by three's filter chain rather than by the content. An
 * order-2 harmonic field carries at most two cycles per revolution, which a handful of
 * samples would resolve, so the PMREM minimum above is the binding constraint and the map
 * stays at it: regenerating 64 x 32 texels is cheap enough to run on every scrub tick,
 * which keeps the no-throttle property ADR-0148 established for the harmonic ambient.
 */
export const SKY_ENVIRONMENT_WIDTH = PMREM_MIN_CUBE_FACE_TEXELS * PMREM_CUBE_FACE_DIVISOR
/** Half the width: one full turn across the map, half a turn from nadir to zenith. */
export const SKY_ENVIRONMENT_HEIGHT = SKY_ENVIRONMENT_WIDTH / 2

/** Channels per texel in the RGBA buffer three uploads. */
const RGBA_CHANNELS = 4
/** The alpha channel's offset within a texel: the last of the four. */
const ALPHA_CHANNEL = RGBA_CHANNELS - 1
/** Samples each texel at its own centre rather than its corner. */
const TEXEL_CENTER = 0.5
/** One full revolution, the azimuth a row of texels spans. */
const FULL_TURN_RAD = Math.PI * 2
/** Half a revolution, the elevation a column of texels spans, nadir to zenith. */
const HALF_TURN_RAD = Math.PI
/** The map is a radiance map; its alpha carries no transparency. */
const OPAQUE_ALPHA = 1
/** Radiance has no negative values, so a ringing reconstruction clamps here. */
const MIN_RADIANCE = 0
/** The alpha every texel carries, converted once rather than per texel. */
const OPAQUE_ALPHA_HALF_FLOAT = THREE.DataUtils.toHalfFloat(OPAQUE_ALPHA)

/**
 * Allocates the environment map, zero-filled. One texture is allocated per rig and then
 * rewritten in place, never reallocated: three caches the filtered PMREM target against
 * the source texture and reuses that target when `pmremVersion` moves, so a fresh texture
 * per update would strand a render target on the GPU for every sky change (ADR-0161).
 *
 * Half float rather than full float because WebGL 2 filters half-float textures without an
 * extension, and the PMREM chain has to filter this one.
 */
export function createSkyEnvironmentTexture(): THREE.DataTexture {
  const texels = new Uint16Array(SKY_ENVIRONMENT_WIDTH * SKY_ENVIRONMENT_HEIGHT * RGBA_CHANNELS)
  const texture = new THREE.DataTexture(
    texels,
    SKY_ENVIRONMENT_WIDTH,
    SKY_ENVIRONMENT_HEIGHT,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  )
  // Equirectangular mapping is the flag three reads to route this through its PMREM
  // conversion when it lands on scene.environment.
  texture.mapping = THREE.EquirectangularReflectionMapping
  // Linear-light radiance, not a display-encoded image: no sRGB decode on sample.
  texture.colorSpace = THREE.LinearSRGBColorSpace
  // DataTexture defaults to nearest filtering, which would step the PMREM's own samples.
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** Clamps a reconstructed channel into the radiance range half float will carry. */
function toRadianceHalfFloat(channel: number): number {
  return THREE.DataUtils.toHalfFloat(Math.max(MIN_RADIANCE, channel))
}

/**
 * Rewrites the map from a set of sky-ambient harmonics, in place. Each texel is sampled at
 * its own centre and mapped to a direction by inverting three's `equirectUV`
 * (`u = atan2(z, x) / 2pi + 0.5`, `v = asin(y) / pi + 0.5`); a DataTexture is not
 * y-flipped, so row 0 is `v = 0`, straight down.
 *
 * An order-2 reconstruction can ring below zero where the dome darkens sharply, and
 * negative radiance is not a colour the filter chain can carry, so channels clamp at zero.
 *
 * Marks the texture for re-upload and bumps `pmremVersion`, which is what makes three
 * refilter the environment into its existing render target.
 */
export function writeSkyEnvironmentTexture(
  texture: THREE.DataTexture,
  skyAmbient: readonly number[],
): void {
  const texels = texture.image.data as Uint16Array
  let offset = 0
  for (let row = 0; row < SKY_ENVIRONMENT_HEIGHT; row += 1) {
    const elevation = ((row + TEXEL_CENTER) / SKY_ENVIRONMENT_HEIGHT - TEXEL_CENTER) * HALF_TURN_RAD
    const upward = Math.sin(elevation)
    const horizontalRadius = Math.cos(elevation)
    for (let column = 0; column < SKY_ENVIRONMENT_WIDTH; column += 1) {
      const azimuth =
        ((column + TEXEL_CENTER) / SKY_ENVIRONMENT_WIDTH - TEXEL_CENTER) * FULL_TURN_RAD
      const radiance = evaluateSphericalHarmonics(skyAmbient, {
        x: horizontalRadius * Math.cos(azimuth),
        y: upward,
        z: horizontalRadius * Math.sin(azimuth),
      })
      texels[offset] = toRadianceHalfFloat(radiance.r)
      texels[offset + 1] = toRadianceHalfFloat(radiance.g)
      texels[offset + 2] = toRadianceHalfFloat(radiance.b)
      texels[offset + ALPHA_CHANNEL] = OPAQUE_ALPHA_HALF_FLOAT
      offset += RGBA_CHANNELS
    }
  }
  texture.needsUpdate = true
  texture.needsPMREMUpdate = true
}
