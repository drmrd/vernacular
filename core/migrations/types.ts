import type { SchemaVersion } from '../model/types'

/** A project document before validation; migrations operate structurally. */
export type ProjectShape = Record<string, unknown>

/** One forward schema migration from version `from` to `from + 1`. */
export interface SchemaMigration {
  readonly from: SchemaVersion
  migrate(project: ProjectShape): ProjectShape
}

/** A per-registry migration applied after the schema chain. */
export interface RegistryMigration {
  readonly registry: string
  readonly from: number
  migrate(project: ProjectShape): ProjectShape
}

/** No migration bridges a required step. Carries the version it stalled at. */
export class MigrationFailedError extends Error {
  constructor(
    public readonly fromVersion: number,
    options?: { cause?: unknown },
  ) {
    super(`No migration from schema version ${fromVersion}`, options)
    this.name = 'MigrationFailedError'
  }
}

/** The document is newer than this build can read. */
export class UnsupportedSchemaVersionError extends Error {
  constructor(
    public readonly fromVersion: number,
    public readonly targetVersion: number,
  ) {
    super(`Schema version ${fromVersion} is newer than supported ${targetVersion}`)
    this.name = 'UnsupportedSchemaVersionError'
  }
}
