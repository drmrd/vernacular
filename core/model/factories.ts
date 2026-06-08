import { builtinElementTypes } from '../registries/element-types'
import { getEntry } from '../registries/registry'
import type { AssetReference } from './asset-reference'
import type {
  EraId,
  Floor,
  Opening,
  OpeningOrientation,
  Point,
  Project,
  Underlay,
  UnitSystem,
  Wall,
} from './types'

// v2 introduces the optional top-level `roomOverrides` map.
export const CURRENT_SCHEMA_VERSION = 2

/** MVP default ceiling height: eight feet (2438.4 mm), rounded to the nearest whole millimeter. */
export const DEFAULT_CEILING_HEIGHT_MM = 2438

export interface NewProjectOptions {
  name: string
  units: UnitSystem
  era: EraId
  appVersion: string
}

export function createEmptyProject(options: NewProjectOptions): Project {
  return {
    meta: {
      name: options.name,
      units: options.units,
      era: options.era,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: options.appVersion,
      registryVersions: {},
    },
    floors: [],
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
  }
}

// A nominal interior door leaf: 32 in wide by 80 in tall (813 mm by 2032 mm),
// rounded to whole millimeters. Used when the named opening type carries no
// `opening` record with its own defaults.
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

export function createOpening(options: NewOpeningOptions): Opening {
  const params = getEntry(builtinElementTypes, options.type)?.opening
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    type: options.type,
    hostWallId: options.hostWallId,
    position: options.position,
    width: options.width ?? params?.defaultWidth ?? DEFAULT_OPENING_WIDTH_MM,
    height: options.height ?? params?.defaultHeight ?? DEFAULT_OPENING_HEIGHT_MM,
    sillHeight: options.sillHeight ?? params?.defaultSillHeight ?? 0,
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
