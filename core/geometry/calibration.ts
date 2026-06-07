import type { Point } from '../model/types'
import { distance } from './point'

/** A line segment in image pixel coordinates, used as the calibration reference. */
export interface PixelSegment {
  start: Point
  end: Point
}

/**
 * Returns the millimeters-per-pixel scale factor such that the drawn
 * pixel segment represents `knownDistanceMm` in world space.
 *
 * @throws {Error} if `segment` has zero pixel length.
 * @throws {Error} if `knownDistanceMm` is not positive.
 */
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
