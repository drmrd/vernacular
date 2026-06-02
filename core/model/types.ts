export type UnitSystem = 'imperial' | 'metric'

/** References an entry in the EraRegistry. */
export type EraId = string

/** Monotonically increasing project-schema version; drives the migration chain. */
export type SchemaVersion = number

export interface ProjectMeta {
  name: string
  units: UnitSystem
  era: EraId
  schemaVersion: SchemaVersion
  appVersion: string
  registryVersions: Record<string, number>
}

export interface Floor {
  id: string
  name: string
  /** Elevation of the finished floor surface, in millimeters. */
  elevation: number
  /** Default ceiling height for rooms on this floor, in millimeters. */
  defaultCeilingHeight: number
}

export interface Project {
  meta: ProjectMeta
  floors: Floor[]
}
