import { linearToSrgb, srgbToOkLab, type LinearRgb } from '../color/oklab'

/** The least chroma a low sun's light must keep, so it still reads as warm and not as grey. */
export const LOW_SUN_CHROMA_MINIMUM = 0.01

/** Scales so the largest channel is 1, encodes to sRGB, and returns the OKLab color. */
export function shadeOf(color: LinearRgb): { a: number; b: number; chroma: number } {
  const largest = Math.max(color.r, color.g, color.b)
  const lab = srgbToOkLab({
    r: linearToSrgb(color.r / largest),
    g: linearToSrgb(color.g / largest),
    b: linearToSrgb(color.b / largest),
  })
  return { a: lab.a, b: lab.b, chroma: Math.hypot(lab.a, lab.b) }
}
