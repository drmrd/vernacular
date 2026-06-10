import type { Point } from '../model/types'

/** A segment of a closed contour in a local two-dimensional frame. Core emits exact arcs; the engine owns tessellation and level of detail. The union is open to further variants (elliptical, spline) additively (foundation spec 3.2). */
export type ContourSegment =
  | { kind: 'line'; to: Point }
  | { kind: 'arc'; to: Point; center: Point; clockwise: boolean }

/** An ordered, closed list of segments; the last segment closes back to start. */
export interface Contour {
  start: Point
  segments: ContourSegment[]
}
