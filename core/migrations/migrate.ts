import type { Project } from '../model/types'
import { CURRENT_SCHEMA_VERSION } from '../model/factories'
import { SCHEMA_MIGRATIONS } from './schema'
import { REGISTRY_MIGRATIONS } from './registries'
import {
  UnsupportedSchemaVersionError,
  type SchemaMigration,
  type RegistryMigration,
} from './types'

export interface MigrateOptions {
  schemaMigrations?: readonly SchemaMigration[]
  registryMigrations?: readonly RegistryMigration[]
  targetVersion?: number
}

function readSchemaVersion(raw: unknown): number {
  const meta = (raw as { meta?: { schemaVersion?: unknown } }).meta
  return Number(meta?.schemaVersion)
}

export function migrateProject(
  raw: unknown,
  {
    schemaMigrations = SCHEMA_MIGRATIONS,
    registryMigrations = REGISTRY_MIGRATIONS,
    targetVersion = CURRENT_SCHEMA_VERSION,
  }: MigrateOptions = {},
): Project {
  void schemaMigrations
  void registryMigrations

  const schemaVersion = readSchemaVersion(raw)
  if (schemaVersion > targetVersion) {
    throw new UnsupportedSchemaVersionError(schemaVersion, targetVersion)
  }

  return structuredClone(raw) as Project
}
