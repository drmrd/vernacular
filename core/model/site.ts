import type { Point } from './types'

/** A geographic location in decimal degrees. */
export interface LatLong {
  latitude: number
  longitude: number
}

/**
 * A top-down massing footprint of a nearby structure or tree, with a height.
 * A non-rendering placeholder (design spec 3.1 and Phase 6); the Phase-8 solar
 * lighting provider would later consume these for obstruction shadows.
 */
export interface Obstruction {
  id: string
  /** Footprint polygon in the plan frame, in world millimeters. */
  footprint: Point[]
  /** Massing height in millimeters. */
  height: number
}

/** Optional project site metadata (design spec 3.1). */
export interface Site {
  latLong?: LatLong
  /** Angle from plan-up to true north, in radians (matching UnderlayPlacement.rotation). */
  northBearing?: number
  obstructions?: Obstruction[]
}
