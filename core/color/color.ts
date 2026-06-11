import { formatHex, parseHex } from './hex'
import { okLabToSrgb, srgbToOkLab, type OkLab } from './oklab'

/**
 * A stored color in the three forms the design specification (section 7.4)
 * requires: OKLab (canonical, used for all math), sRGB hex (display and
 * serialization), and an optional originalSpec source identifier (for example a
 * descriptive source color code the user records). The triple is always
 * consistent because it is only built through the constructors below.
 */
export interface Color {
  oklab: OkLab
  srgbHex: string
  originalSpec?: string
}

export function colorFromHex(srgbHex: string, originalSpec?: string): Color {
  const oklab = srgbToOkLab(parseHex(srgbHex))
  const normalizedHex = formatHex(parseHex(srgbHex))
  return { oklab, srgbHex: normalizedHex, ...(originalSpec !== undefined ? { originalSpec } : {}) }
}

export function colorFromOkLab(oklab: OkLab, originalSpec?: string): Color {
  const srgbHex = formatHex(okLabToSrgb(oklab))
  return { oklab, srgbHex, ...(originalSpec !== undefined ? { originalSpec } : {}) }
}

/**
 * A color with a required accessible name (design spec 7.4: every chip carries
 * its name). It lives here, beside Color, so both the palette registry and the
 * project-local palette model import it from one home and the import direction
 * stays core/registries and core/model both depending on core/color.
 */
export interface NamedColor {
  name: string
  color: Color
}
