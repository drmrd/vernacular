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

/**
 * Ground-surface grade datum, in millimeters, used when a site carries no explicit
 * grade. Above-grade floors sit at positive elevations and basements at negative
 * ones relative to this datum (ADR-0131).
 */
export const DEFAULT_GRADE_ELEVATION_MM = 0

/** Optional project site metadata (design spec 3.1). */
export interface Site {
  latLong?: LatLong
  /** Angle from plan-up to true north, in radians (matching UnderlayPlacement.rotation). */
  northBearing?: number
  obstructions?: Obstruction[]
  /**
   * Ground-surface elevation in millimeters: the datum the ground plane sits at and
   * the threshold the whole-building view treats as below grade. Absent means the
   * 0 datum, decoupling grade from the finished-floor-zero convention only when set.
   */
  gradeElevation?: number
  /**
   * IANA time-zone identifier for the site, for example `America/New_York`. Used
   * with the site location and an observation instant to place the sun (slice 1a).
   * Absent means the timezone has not been set.
   */
  timezone?: string
}

/** The site's explicit grade elevation, or the default datum when none is set. */
export function resolveGradeElevation(site?: Site): number {
  return site?.gradeElevation ?? DEFAULT_GRADE_ELEVATION_MM
}
