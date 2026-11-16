import { parseHex } from '../color/hex'
import { type LinearRgb, srgbToLinear } from '../color/oklab'

/** The mowed-lawn green of the ground surface, as the engine paints it. */
export const GROUND_SURFACE_HEX = '#5f8a4f'

const groundSurfaceSrgb = parseHex(GROUND_SURFACE_HEX)

/** The lawn's reflectance in linear-light sRGB, decoded from GROUND_SURFACE_HEX. */
export const GROUND_SURFACE_COLOR: LinearRgb = {
  r: srgbToLinear(groundSurfaceSrgb.r),
  g: srgbToLinear(groundSurfaceSrgb.g),
  b: srgbToLinear(groundSurfaceSrgb.b),
}
