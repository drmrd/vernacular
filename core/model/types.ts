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

/** Enumerates the discriminant `kind` values of `UnderlaySource`: the raster, document, and scene source families. */
export type UnderlayKind = 'raster' | 'document' | 'scene'

/** Reference + per-kind data for an underlay's source content (content-addressed, ADR-0007). */
export type UnderlaySource =
  | { kind: 'raster'; image: AssetReference }
  | { kind: 'document'; document: AssetReference; page: number }
  | { kind: 'scene'; scene: AssetReference }

export interface Underlay {
  id: string
  /** Discriminated reference to the underlay's source content (content-addressed, ADR-0007). */
  source: UnderlaySource
  /** Source content dimensions in pixels. */
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
 * The old-house architectural vocabulary fields (`purpose`, `subPurpose`,
 * `periodOverride`, `styleOverride`) live here, each optional, alongside the
 * room name and custom polygon.
 */
export interface RoomOverride {
  /** User-entered display name for the room; absent means geometry only (no name). */
  name?: string
  /** Replacement boundary for cases where wall topology cannot infer a room (porch, L-shaped sub-zone). */
  customPolygon?: Point[]
  /** Primary room purpose, a RoomPurposeRegistry id. Absent means untagged. */
  purpose?: RoomPurposeId
  /** Optional finer-grained free-text purpose label (for example "Silver Pantry"). Never required. */
  subPurpose?: string
  /** Explicit period override; absent means inherit the floor or project period. */
  periodOverride?: PeriodId
  /** Explicit style override; absent means inherit the floor or project style. */
  styleOverride?: StyleTag
}

/** How a stair run is shaped in plan; see the design specification, sections 3.1 and 3.2. */
export type StairRunType = 'straight' | 'l-turn' | 'u-turn' | 'winder' | 'spiral'

/**
 * The pair of floors a stair joins. The run rises from `fromFloorId` to
 * `toFloorId`; the type does not enforce any elevation ordering, so keeping
 * the direction sensible is the caller's responsibility.
 */
export interface StairConnection {
  fromFloorId: string
  toFloorId: string
}

/**
 * A stair joining two floors. Stairs live in a top-level, floor-spanning array
 * rather than on a single floor because they connect two floors; see the design
 * specification, sections 3.1 and 3.2.
 */
export interface Stair {
  id: string
  runType: StairRunType
  /** Plan position of the stair origin, in world millimeters. */
  position: Point
  /** Run width in millimeters. */
  width: number
  /** Run length (plan footprint) in millimeters. */
  length: number
  /** Rotation in radians about `position`. */
  rotation: number
  connection: StairConnection
}

export interface Project {
  meta: ProjectMeta
  floors: Floor[]
  /**
   * Floor-spanning stairs. A sibling of `floors` because each stair connects two
   * floors; see the design specification, sections 3.1 and 3.2.
   */
  stairs: Stair[]
  /**
   * Per-room user metadata keyed by `roomKey(room)`. A sibling of `meta` and
   * `floors` so an undoable command can reassign it whole (the inverse-capture
   * proxy records only the root's own top-level keys). Absent means no overrides.
   */
  roomOverrides?: Record<string, RoomOverride> | undefined
}
