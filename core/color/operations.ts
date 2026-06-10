import { colorFromOkLab, type Color } from './color'

/**
 * Linearly interpolate each OKLab component (L, a, b) between two colors and
 * rebuild a consistent Color. Mixing in OKLab yields a perceptual blend rather
 * than the muddy midpoints of an sRGB lerp (design spec 7.4).
 */
export function mixColors(from: Color, to: Color, t: number): Color {
  return colorFromOkLab({
    // eslint-disable-next-line @typescript-eslint/naming-convention -- L is the published OKLab lightness axis, not a renamable identifier
    L: from.oklab.L + (to.oklab.L - from.oklab.L) * t,
    a: from.oklab.a + (to.oklab.a - from.oklab.a) * t,
    b: from.oklab.b + (to.oklab.b - from.oklab.b) * t,
  })
}

/** Euclidean distance between two colors in OKLab, a perceptual difference metric. */
export function perceptualDistance(from: Color, to: Color): number {
  const dL = from.oklab.L - to.oklab.L
  const da = from.oklab.a - to.oklab.a
  const db = from.oklab.b - to.oklab.b
  return Math.hypot(dL, da, db)
}

/**
 * Find the candidate with the smallest perceptual distance to the target by
 * linear scan. Returns undefined (never null) for an empty candidate list.
 */
export function nearestColor(target: Color, candidates: readonly Color[]): Color | undefined {
  let best: Color | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = perceptualDistance(target, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}
