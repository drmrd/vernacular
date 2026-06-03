import type { EraId, Floor, Point, Project, UnitSystem, Wall } from './types'

export const CURRENT_SCHEMA_VERSION = 1

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
  }
}
