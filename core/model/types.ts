import type { AssetReference } from './asset-reference'

export type UnitSystem = 'imperial' | 'metric'

/** References an entry in the PeriodRegistry. Validated at the registry boundary, not by this alias. */
export type PeriodId = string

/** References an entry in the StyleRegistry. Validated at the registry boundary, not by this alias. */
export type StyleId = string

/**
 * References an entry in the RoomPurposeRegistry. Validated at the registry
 * boundary, not by this alias.
 */
export type RoomPurposeId = string

/**
 * A style tag: a StyleRegistry id, optionally marked as the vernacular variant
 * of an academic style. The `vernacular` modifier is meaningful only when the
 * referenced Style entry declares `hasVernacularVariant`; it is ignored on
 * entries that are themselves vernacular forms.
 */
export interface StyleTag {
  styleId: StyleId
  vernacular?: boolean
}

/** Monotonically increasing project-schema version; drives the migration chain. */
export type SchemaVersion = number

export interface ProjectMeta {
  name: string
  units: UnitSystem
  /** The project's default chronological period; floors and rooms can override. */
  period: PeriodId
  /** The project's default architectural style; floors and rooms can override. */
  style?: StyleTag
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

/** One end of a wall: its start point or its end point. */
export type WallEnd = 'start' | 'end'

export interface OpeningOrientation {
  /** Which jamb anchors the leaf, as the host-wall end nearer it. */
  hinge: WallEnd
  /** Sign of the wall's left-hand normal the leaf opens toward. */
  facing: 'positive' | 'negative'
}

export interface Opening {
  id: string
  /** ElementType id, category 'opening'. */
  type: string
  hostWallId: string
  /** Millimeters from the host wall start to the opening center, along the wall. */
  position: number
  /** Opening width in millimeters. */
  width: number
  /** Opening height in millimeters. */
  height: number
  /** Height of the sill above the finished floor, in millimeters. */
  sillHeight: number
  orientation: OpeningOrientation
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

export interface Dimension {
  id: string
  /** First measured point, in world millimeters. */
  start: Point
  /** Second measured point, in world millimeters. */
  end: Point
  /**
   * Perpendicular offset of the dimension line from the measured segment, in
   * millimeters. 0 places the dimension line on the segment.
   */
  offset: number
}

export interface Floor {
  id: string
  name: string
  /** Elevation of the finished floor surface, in millimeters. */
  elevation: number
  /** Default ceiling height for rooms on this floor, in millimeters. */
  defaultCeilingHeight: number
  /** Explicit period override; absent means inherit the project period. */
  periodOverride?: PeriodId
  /** Explicit style override; absent means inherit the project style. */
  styleOverride?: StyleTag
  walls: Wall[]
  underlays: Underlay[]
  openings: Opening[]
  dimensions: Dimension[]
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
