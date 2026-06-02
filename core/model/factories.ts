import type { EraId, Floor, Project, UnitSystem } from './types'

export const CURRENT_SCHEMA_VERSION = 1

/** MVP default ceiling height: eight feet, expressed in millimeters. */
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

export interface NewFloorOptions {
  id?: string
  elevation?: number
  defaultCeilingHeight?: number
}

export function createFloor(name: string, options: NewFloorOptions = {}): Floor {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    name,
    elevation: options.elevation ?? 0,
    defaultCeilingHeight: options.defaultCeilingHeight ?? DEFAULT_CEILING_HEIGHT_MM,
  }
}
