import type { Point } from '../model/types'
import { distance } from './point'

export interface PixelSegment {
  start: Point // image pixel coordinates
  end: Point
}

/** Millimeters-per-pixel so the drawn pixel segment measures `knownDistanceMm` in world units. Throws on a zero-length segment or a non-positive distance. */
export function calibrationScale(segment: PixelSegment, knownDistanceMm: number): number {
  const pixelLength = distance(segment.start, segment.end)
  if (pixelLength === 0) {
    throw new Error('calibrationScale requires a non-zero-length pixel segment')
  }
  if (knownDistanceMm <= 0) {
    throw new Error('calibrationScale requires a positive known distance')
  }
  return knownDistanceMm / pixelLength
}
