import type { AssetReference } from './asset-reference'
import type { EraId, Floor, Point, Project, Underlay, UnitSystem, Wall } from './types'

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
  }
}

// Pre-calibration baseline: one world millimeter per source image pixel. The
// calibration tool replaces this once the user matches a known dimension.
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
