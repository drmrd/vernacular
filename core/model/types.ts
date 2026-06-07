import type { AssetReference } from './asset-reference'

export type UnitSystem = 'imperial' | 'metric'

/** References an entry in the EraRegistry. Validated at the registry boundary, not by this alias. */
export type EraId = string

/** Monotonically increasing project-schema version; drives the migration chain. */
export type SchemaVersion = number

export interface ProjectMeta {
  name: string
  units: UnitSystem
  era: EraId
  schemaVersion: SchemaVersion
  appVersion: string
  /**
   * Per-registry version the project was last saved against, keyed by registry
   * name (for example "elementTypes" or "finishes"). Drives registry-aware
   * migration. See the design specification, section 3.4.
   */
  registryVersions: Record<string, number>
}

/** A point in floor-plan space, in millimeters. x increases rightward, y increases upward. */
export interface Point {
  x: number
  y: number
}

export interface Wall {
  id: string
  start: Point
  end: Point
  /** Wall thickness in millimeters. */
  thickness: number
}

export interface UnderlayPlacement {
  /** World position (millimeters) of the underlay's pixel origin (top-left). */
  offset: Point
  /** World millimeters per source image pixel; the calibrated scale. */
  millimetersPerPixel: number
  /**
   * Rotation in radians about `offset`. Positive values rotate clockwise on
   * screen, matching the image's downward-y pixel axes; 0 for an axis-aligned
   * underlay.
   */
  rotation: number
}

export interface Underlay {
  id: string
  /** Content-addressed reference to the raster image bytes (ADR-0007). */
  image: AssetReference
  /** Source image dimensions in pixels. */
  width: number
  height: number
  placement: UnderlayPlacement
  /** 0 (transparent) to 1 (opaque). */
  opacity: number
  visible: boolean
}

export interface Floor {
  id: string
  name: string
  /** Elevation of the finished floor surface, in millimeters. */
  elevation: number
  /** Default ceiling height for rooms on this floor, in millimeters. */
  defaultCeilingHeight: number
  walls: Wall[]
  underlays: Underlay[]
}

/**
 * User-supplied metadata for a derived room, stored separately from geometry.
 * Held in `Project.roomOverrides`, keyed by `roomKey(room)` (the sorted
 * bounding-wall-id string the room derivation encodes in `Room.id`). An absent
 * map means no overrides.
 *
 * Room `purpose`, `subPurpose`, and `eraOverride` (the design specification's
 * room identity) are deliberately not here yet; they arrive additively with the
 * old-house architectural vocabulary milestone.
 */
export interface RoomOverride {
  /** User-entered display name for the room; absent means geometry only (no name). */
  name?: string
  /** Replacement boundary for cases where wall topology cannot infer a room (porch, L-shaped sub-zone). */
  customPolygon?: Point[]
}

export interface Project {
  meta: ProjectMeta
  floors: Floor[]
  /**
   * Per-room user metadata keyed by `roomKey(room)`. A sibling of `meta` and
   * `floors` so an undoable command can reassign it whole (the inverse-capture
   * proxy records only the root's own top-level keys). Absent means no overrides.
   */
  roomOverrides?: Record<string, RoomOverride> | undefined
}
