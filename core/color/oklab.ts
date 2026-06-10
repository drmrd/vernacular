/** A color in the sRGB color space, each channel a 0..1 fraction (gamma-encoded). */
export interface Srgb {
  r: number
  g: number
  b: number
}

/** A color in linear-light sRGB, each channel a 0..1 fraction. */
export interface LinearRgb {
  r: number
  g: number
  b: number
}

/** A color in the OKLab perceptual space: L lightness (0..1), a and b chroma axes. */
export interface OkLab {
  // L is the canonical OKLab lightness axis name from the published color space
  // definition, so it is intentionally uppercase rather than camelCase.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- published OKLab axis name
  L: number
  a: number
  b: number
}

/*
 * The numeric literals below are the published constants of the standard sRGB
 * transfer function and Bjorn Ottosson's OKLab conversion matrices (the
 * linear-sRGB-to-LMS matrix, the cube-root nonlinearity, and the LMS-to-Lab
 * matrix, plus their inverses). They are an exact, well-specified definition,
 * not unexplained magic numbers, so no-magic-numbers is disabled for this block.
 */
/* eslint-disable no-magic-numbers, @typescript-eslint/naming-convention -- published sRGB gamma and OKLab matrix coefficients; L is the canonical OKLab lightness axis name */

export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
}

export function srgbToOkLab(srgb: Srgb): OkLab {
  const r = srgbToLinear(srgb.r)
  const g = srgbToLinear(srgb.g)
  const b = srgbToLinear(srgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function okLabToSrgb(lab: OkLab): Srgb {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

/* eslint-enable no-magic-numbers, @typescript-eslint/naming-convention */
