import type { LinearRgb } from './oklab'

const RGB_CHANNEL_COUNT = 3

export function clampToUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function mixLinearRgb(from: LinearRgb, to: LinearRgb, fraction: number): LinearRgb {
  return {
    r: from.r + (to.r - from.r) * fraction,
    g: from.g + (to.g - from.g) * fraction,
    b: from.b + (to.b - from.b) * fraction,
  }
}

export function scaleLinearRgb(color: LinearRgb, factor: number): LinearRgb {
  return { r: color.r * factor, g: color.g * factor, b: color.b * factor }
}

/** The grey a color flattens toward under cloud: its own channel mean. */
export function greyOf(color: LinearRgb): LinearRgb {
  const mean = (color.r + color.g + color.b) / RGB_CHANNEL_COUNT
  return { r: mean, g: mean, b: mean }
}
