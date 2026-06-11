import { parseHex } from './hex'
import { srgbToLinear, type Srgb } from './oklab'

/*
 * WCAG 2.x contrast math. The sRGB transfer function is shared with the color
 * space code (srgbToLinear), so the gamma curve has a single definition; only the
 * relative-luminance channel weights and the contrast-ratio ambient term are
 * specific to WCAG and named here.
 */
const LUMINANCE_RED = 0.2126
const LUMINANCE_GREEN = 0.7152
const LUMINANCE_BLUE = 0.0722
const CONTRAST_AMBIENT = 0.05

/** WCAG relative luminance of an sRGB color, channels as 0..1 fractions. */
export function relativeLuminance(color: Srgb): number {
  return (
    LUMINANCE_RED * srgbToLinear(color.r) +
    LUMINANCE_GREEN * srgbToLinear(color.g) +
    LUMINANCE_BLUE * srgbToLinear(color.b)
  )
}

/** WCAG contrast ratio (1..21) between two hex colors. Throws on malformed input. */
export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseHex(foreground))
  const backgroundLuminance = relativeLuminance(parseHex(background))
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + CONTRAST_AMBIENT) / (darker + CONTRAST_AMBIENT)
}
