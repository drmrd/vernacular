import type { Project } from '../model/types'
import { CURRENT_SCHEMA_VERSION } from '../model/factories'
import { SCHEMA_MIGRATIONS } from './schema'
import {
  MalformedProjectError,
  MigrationFailedError,
  UnsupportedSchemaVersionError,
  type ProjectShape,
  type SchemaMigration,
  type RegistryMigration,
} from './types'

export interface MigrateOptions {
  schemaMigrations?: readonly SchemaMigration[]
  registryMigrations?: readonly RegistryMigration[]
  targetVersion?: number
}

function readSchemaVersion(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) {
    throw new MalformedProjectError()
  }
  const meta = (raw as { meta?: unknown }).meta
  if (typeof meta !== 'object' || meta === null) {
    throw new MalformedProjectError()
  }
  const schemaVersion = (meta as { schemaVersion?: unknown }).schemaVersion
  if (typeof schemaVersion !== 'number' || Number.isNaN(schemaVersion)) {
    throw new MalformedProjectError()
  }
  return schemaVersion
}

export function migrateProject(raw: unknown, options: MigrateOptions = {}): Project {
  const target = options.targetVersion ?? CURRENT_SCHEMA_VERSION
  const schemaVersion = readSchemaVersion(raw)
  if (schemaVersion > target) {
    throw new UnsupportedSchemaVersionError(schemaVersion, target)
  }

  const schemaMigrations = options.schemaMigrations ?? SCHEMA_MIGRATIONS
  let working = structuredClone(raw) as ProjectShape

  let current = schemaVersion
  while (current < target) {
    const migration = schemaMigrations.find((candidate) => candidate.from === current)
    if (migration === undefined) {
      throw new MigrationFailedError(current)
    }
    working = migration.migrate(working)
    const meta = working.meta as Record<string, unknown>
    working = { ...working, meta: { ...meta, schemaVersion: current + 1 } }
    current += 1
  }

  return working as unknown as Project
}
