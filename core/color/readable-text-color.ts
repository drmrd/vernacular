import { contrastRatio } from './contrast'

/**
 * Pick whichever candidate label color reads most legibly on `fillHex`.
 * Returns the candidate with the higher WCAG contrast ratio against the fill
 * (ties favor the light candidate), so a label placed on a variable swatch
 * always lands on the more readable side. This is best effort: if neither
 * candidate clears the AA floor on a very mid-tone fill, the higher-contrast
 * one is still returned. Hex inputs are 6-digit sRGB (#rrggbb).
 */
export function readableTextColor(
  fillHex: string,
  candidates: { light: string; dark: string },
): string {
  const lightRatio = contrastRatio(candidates.light, fillHex)
  const darkRatio = contrastRatio(candidates.dark, fillHex)
  return lightRatio >= darkRatio ? candidates.light : candidates.dark
}
