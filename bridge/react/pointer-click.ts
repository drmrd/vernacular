/** A screen-space point in CSS pixels. */
export interface PointerPoint {
  x: number
  y: number
}

/**
 * Whether a pointer press and release are close enough to count as a click rather than a
 * drag. A drag (to orbit or pan the camera) moves the pointer well past the tolerance, so
 * it must not register as a click and select whatever sat under the press. Compares the
 * straight-line travel from press to release against the tolerance.
 */
export function isClick(down: PointerPoint, up: PointerPoint, tolerancePx: number): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= tolerancePx
}
