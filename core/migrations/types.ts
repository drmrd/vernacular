import type { SchemaVersion } from '../model/types'

/** A project document before validation; migrations operate structurally. */
export type ProjectShape = Record<string, unknown>

/** One forward schema migration from version `from` to `from + 1`. */
export interface SchemaMigration {
  readonly from: SchemaVersion
  /**
   * Transform the document's data only. The orchestrator advances
   * `meta.schemaVersion` after each step, so a migration must not set
   * `meta.schemaVersion` itself.
   */
  migrate(project: ProjectShape): ProjectShape
}

/** A per-registry migration applied after the schema chain. */
export interface RegistryMigration {
  readonly registry: string
  readonly from: number
  /**
   * Transform the document's data only. The orchestrator advances this
   * registry's entry in `meta.registryVersions` after each step, so a
   * migration must not set its own registry's version itself.
   */
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

/** A document is not a recognizable project (missing or non-numeric meta.schemaVersion). */
export class MalformedProjectError extends Error {
  constructor(message = 'Project document is missing a numeric meta.schemaVersion') {
    super(message)
    this.name = 'MalformedProjectError'
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
