import { builtinElementTypes } from '../registries/element-types'
import { getEntry } from '../registries/registry'
import type { AssetReference } from './asset-reference'
import type {
  Dimension,
  Floor,
  Opening,
  OpeningOrientation,
  PeriodId,
  Point,
  Project,
  Stair,
  StairConnection,
  StairRunType,
  StyleTag,
  Underlay,
  UnitSystem,
  Wall,
} from './types'

// v2 introduces the optional top-level `roomOverrides` map; v3 adds the
// per-floor `openings` array; v4 adds the per-floor `dimensions` array; v5
// renames the project `era` field to `period`, adds the optional project
// `style`, and adds the optional per-floor `periodOverride` and `styleOverride`
// (the per-room period, style, purpose, and sub-purpose ride inside the optional
// roomOverrides map and need no migration); v6 adds the top-level floor-spanning
// `stairs` array.
export const CURRENT_SCHEMA_VERSION = 6

/** MVP default ceiling height: eight feet (2438.4 mm), rounded to the nearest whole millimeter. */
export const DEFAULT_CEILING_HEIGHT_MM = 2438

export interface NewProjectOptions {
  name: string
  units: UnitSystem
  period: PeriodId
  style?: StyleTag
  appVersion: string
}

export function createEmptyProject(options: NewProjectOptions): Project {
  return {
    meta: {
      name: options.name,
      units: options.units,
      period: options.period,
      ...(options.style !== undefined ? { style: options.style } : {}),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: options.appVersion,
      registryVersions: {},
    },
    floors: [],
    stairs: [],
  }
}

// A nominal interior partition: a 2x4 stud wall (89 mm) with finish on both
// faces lands near 114 mm. Period plaster-and-lath walls are thicker; wall
// construction types arrive in Phase 1, so a single default suffices here.
export const DEFAULT_WALL_THICKNESS_MM = 114

export interface NewWallOptions {
  id?: string
  thickness?: number
}

export function createWall(start: Point, end: Point, options: NewWallOptions = {}): Wall {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    start,
    end,
    thickness: options.thickness ?? DEFAULT_WALL_THICKNESS_MM,
  }
}

export interface NewFloorOptions {
  id?: string
  elevation?: number
  defaultCeilingHeight?: number
  walls?: Wall[]
}

export function createFloor(name: string, options: NewFloorOptions = {}): Floor {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    name,
    elevation: options.elevation ?? 0,
    defaultCeilingHeight: options.defaultCeilingHeight ?? DEFAULT_CEILING_HEIGHT_MM,
    walls: options.walls ?? [],
    underlays: [],
    openings: [],
    dimensions: [],
  }
}

// A nominal interior door leaf: 32 in wide by 80 in tall (813 mm by 2032 mm),
// rounded to whole millimeters.
export const DEFAULT_OPENING_WIDTH_MM = 813
export const DEFAULT_OPENING_HEIGHT_MM = 2032

export interface NewOpeningOptions {
  type: string
  hostWallId: string
  position: number
  width?: number
  height?: number
  sillHeight?: number
  orientation?: OpeningOrientation
  id?: string
}

// Doors sit on the floor; the sill height only matters for windows and other
// raised openings, so the fallback when an element type omits it is zero.
const DEFAULT_OPENING_SILL_HEIGHT_MM = 0

function openingDefaults(type: string): {
  width: number
  height: number
  sillHeight: number
} {
  const params = getEntry(builtinElementTypes, type)?.opening
  return {
    width: params?.defaultWidth ?? DEFAULT_OPENING_WIDTH_MM,
    height: params?.defaultHeight ?? DEFAULT_OPENING_HEIGHT_MM,
    sillHeight: params?.defaultSillHeight ?? DEFAULT_OPENING_SILL_HEIGHT_MM,
  }
}

export function createOpening(options: NewOpeningOptions): Opening {
  const defaults = openingDefaults(options.type)
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    type: options.type,
    hostWallId: options.hostWallId,
    position: options.position,
    width: options.width ?? defaults.width,
    height: options.height ?? defaults.height,
    sillHeight: options.sillHeight ?? defaults.sillHeight,
    orientation: options.orientation ?? { hinge: 'start', facing: 'positive' },
  }
}

// Pre-calibration baseline: one world millimeter per source image pixel. The
// calibration tool replaces this once the user matches a known dimension;
// calibrated scans typically land well above 1 (often tens of millimeters per
// pixel for a whole-floor plan scanned at low resolution).
export const DEFAULT_UNDERLAY_MM_PER_PIXEL = 1

export interface NewUnderlayOptions {
  image: AssetReference
  width: number
  height: number
}

export function createUnderlay(options: NewUnderlayOptions): Underlay {
  return {
    id: globalThis.crypto.randomUUID(),
    image: options.image,
    width: options.width,
    height: options.height,
    placement: {
      offset: { x: 0, y: 0 },
      millimetersPerPixel: DEFAULT_UNDERLAY_MM_PER_PIXEL,
      rotation: 0,
    },
    opacity: 1,
    visible: true,
  }
}

export interface NewDimensionOptions {
  start: Point
  end: Point
  offset?: number
  id?: string
}

export function createDimension(options: NewDimensionOptions): Dimension {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    start: options.start,
    end: options.end,
    offset: options.offset ?? 0,
  }
}

// A nominal residential stair: 36 in wide (914 mm) by a 3000 mm plan footprint,
// rounded to whole millimeters.
export const DEFAULT_STAIR_WIDTH_MM = 914
export const DEFAULT_STAIR_LENGTH_MM = 3000

export interface NewStairOptions {
  runType?: StairRunType
  position?: Point
  width?: number
  length?: number
  rotation?: number
  connection: StairConnection
  id?: string
}

export function createStair(options: NewStairOptions): Stair {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    runType: options.runType ?? 'straight',
    position: options.position ?? { x: 0, y: 0 },
    width: options.width ?? DEFAULT_STAIR_WIDTH_MM,
    length: options.length ?? DEFAULT_STAIR_LENGTH_MM,
    rotation: options.rotation ?? 0,
    connection: options.connection,
  }
}
