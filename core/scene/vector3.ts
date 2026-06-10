/** A point in Three.js world space: right-handed, Y-up, millimeters. */
export interface Vector3 {
  x: number
  y: number
  z: number
}

/** An axis-aligned bounding box in world space. */
export interface Bounds3 {
  min: Vector3
  max: Vector3
}
