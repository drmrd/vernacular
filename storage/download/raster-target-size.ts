/** A rasterized dimension never rounds below one whole pixel. */
const MIN_PIXELS = 1

/** Never upscale: the scale factor caps at one. */
const MAX_SCALE = 1

/**
 * The pixel size to rasterize an SVG of intrinsic `width` x `height` so its
 * longest edge is at most `maxEdge`. The longest edge is scaled down to fit,
 * never up, so a plan smaller than `maxEdge` keeps its intrinsic size. Each
 * returned dimension is rounded to whole pixels and floored at one pixel so a
 * dimension never collapses to zero.
 */
export function rasterTargetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(MAX_SCALE, maxEdge / Math.max(width, height))
  return {
    width: Math.max(MIN_PIXELS, Math.round(width * scale)),
    height: Math.max(MIN_PIXELS, Math.round(height * scale)),
  }
}
