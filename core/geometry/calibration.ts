import type { Point, UnderlayPlacement } from '../model/types'
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

/**
 * Returns the placement updated to the given millimeters-per-pixel scale,
 * keeping the offset and rotation unchanged.
 *
 * @param placement - the current underlay placement.
 * @param millimetersPerPixel - the calibrated world millimeters per source pixel.
 * @returns a new placement with the updated scale; the input is not mutated.
 */
export function applyCalibration(
  placement: UnderlayPlacement,
  millimetersPerPixel: number,
): UnderlayPlacement {
  return { ...placement, millimetersPerPixel }
}
