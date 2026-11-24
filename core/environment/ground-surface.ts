import { linearLuminance } from '../color/contrast'
import { parseHex } from '../color/hex'
import { type LinearRgb, srgbToLinear } from '../color/oklab'
import type { AssetReference } from '../model/asset-reference'

/** The mowed-lawn green of the ground surface, as the engine paints it. */
export const GROUND_SURFACE_HEX = '#5f8a4f'

const groundSurfaceSrgb = parseHex(GROUND_SURFACE_HEX)

/** The lawn's reflectance in linear-light sRGB, decoded from GROUND_SURFACE_HEX. */
export const GROUND_SURFACE_COLOR: LinearRgb = {
  r: srgbToLinear(groundSurfaceSrgb.r),
  g: srgbToLinear(groundSurfaceSrgb.g),
  b: srgbToLinear(groundSurfaceSrgb.b),
}

const groundBounceLuminance = linearLuminance(GROUND_SURFACE_COLOR)

/**
 * The reflectance the light dome gives the ground: the lawn's luminance with no hue. A colored
 * bounce from the whole lower dome tints every shaded wall with the lawn's green; the bounce of
 * the real ground near a wall is later work. The visible lawn keeps GROUND_SURFACE_COLOR.
 */
export const GROUND_BOUNCE_COLOR: LinearRgb = {
  r: groundBounceLuminance,
  g: groundBounceLuminance,
  b: groundBounceLuminance,
}

/** The generated mown-grass tile of starter pack 1.1.0, which the ground does not draw yet. */
export const GROUND_GRASS_REFERENCE: AssetReference = {
  scope: 'pack:vernacular-starter@1.1.0',
  contentHash: '6124c956bf1980cfb3da2322f5fc2a55fa4d8e44912faba58618270ced1b8f76',
}
