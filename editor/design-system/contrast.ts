// WCAG relative-luminance and contrast-ratio math over sRGB color strings. Pure
// functions with no DOM, so the token palette can be verified in the unit gate.

interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

const CHANNEL_MAX = 255
const HEX_RADIX = 16
const SHORT_HEX_LENGTH = 3
const SRGB_LINEAR_THRESHOLD = 0.03928
const SRGB_LINEAR_DIVISOR = 12.92
const SRGB_GAMMA_OFFSET = 0.055
const SRGB_GAMMA_SCALE = 1.055
const SRGB_GAMMA_EXPONENT = 2.4
const LUMINANCE_RED = 0.2126
const LUMINANCE_GREEN = 0.7152
const LUMINANCE_BLUE = 0.0722
const CONTRAST_AMBIENT = 0.05

function parseHex(text: string): Rgb {
  const body = text.slice(1)
  const full = body.length === SHORT_HEX_LENGTH ? body.replace(/./g, (c) => c + c) : body
  const [r = 0, g = 0, b = 0] = (full.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, HEX_RADIX))
  return { r, g, b }
}

function parseRgb(text: string): Rgb {
  const [r = 0, g = 0, b = 0] = text
    .replace(/rgba?\(|\)/g, '')
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number)
  return { r, g, b }
}

export function parseColor(value: string): Rgb {
  const text = value.trim()
  return text.startsWith('#') ? parseHex(text) : parseRgb(text)
}

function channelLuminance(channel: number): number {
  const ratio = channel / CHANNEL_MAX
  if (ratio <= SRGB_LINEAR_THRESHOLD) {
    return ratio / SRGB_LINEAR_DIVISOR
  }
  return ((ratio + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA_EXPONENT
}

export function relativeLuminance(color: Rgb): number {
  return (
    LUMINANCE_RED * channelLuminance(color.r) +
    LUMINANCE_GREEN * channelLuminance(color.g) +
    LUMINANCE_BLUE * channelLuminance(color.b)
  )
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(parseColor(foreground))
  const second = relativeLuminance(parseColor(background))
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + CONTRAST_AMBIENT) / (darker + CONTRAST_AMBIENT)
}
