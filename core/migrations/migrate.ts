import type { Project } from '../model/types'
import { CURRENT_SCHEMA_VERSION } from '../model/factories'
import { SCHEMA_MIGRATIONS } from './schema'
import { REGISTRY_MIGRATIONS } from './registries'
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
  /** Per-registry migrations applied after the schema chain completes. */
  registryMigrations?: readonly RegistryMigration[]
  targetVersion?: number
}

/** The version a migration brings a document to: the option when given, else the current one. */
export function targetVersionOf(options: MigrateOptions = {}): number {
  return options.targetVersion ?? CURRENT_SCHEMA_VERSION
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

function readRegistryVersions(working: ProjectShape): Record<string, number> | undefined {
  const meta = working.meta as { registryVersions?: unknown }
  const registryVersions = meta.registryVersions
  if (typeof registryVersions !== 'object' || registryVersions === null) {
    return undefined
  }
  return registryVersions as Record<string, number>
}

function findRegistryMigration(
  migrations: readonly RegistryMigration[],
  registry: string,
  version: number,
): RegistryMigration | undefined {
  return migrations.find(
    (candidate) => candidate.registry === registry && candidate.from === version,
  )
}

function applyRegistryMigrations(
  project: ProjectShape,
  migrations: readonly RegistryMigration[],
): ProjectShape {
  const registryVersions = readRegistryVersions(project)
  if (registryVersions === undefined) {
    return project
  }

  let working = project
  for (const registry of Object.keys(registryVersions)) {
    let version = registryVersions[registry] ?? 0
    let migration = findRegistryMigration(migrations, registry, version)
    while (migration !== undefined) {
      working = migration.migrate(working)
      const meta = working.meta as Record<string, unknown>
      const versions = meta.registryVersions as Record<string, number>
      working = {
        ...working,
        meta: { ...meta, registryVersions: { ...versions, [registry]: version + 1 } },
      }
      version += 1
      migration = findRegistryMigration(migrations, registry, version)
    }
  }
  return working
}

/**
 * Whether `migrateProject` with the same options would change the document: its schema version is
 * below the target, or a registry named in `meta.registryVersions` has a step from its stored
 * version. Answers false for a version above the target, where `migrateProject` throws instead.
 * Both functions read the same two lists the same way: a registry that `meta.registryVersions`
 * does not name is ignored by both, and a missing registry version counts as 0. Throws
 * `MalformedProjectError` when the document has no numeric schema version.
 */
export function isMigrationPending(raw: unknown, options: MigrateOptions = {}): boolean {
  const target = targetVersionOf(options)
  const schemaVersion = readSchemaVersion(raw)
  if (schemaVersion !== target) return schemaVersion < target
  const registryVersions = readRegistryVersions(raw as ProjectShape)
  if (registryVersions === undefined) return false
  const migrations = options.registryMigrations ?? REGISTRY_MIGRATIONS
  return Object.keys(registryVersions).some(
    (registry) =>
      findRegistryMigration(migrations, registry, registryVersions[registry] ?? 0) !== undefined,
  )
}

export function migrateProject(raw: unknown, options: MigrateOptions = {}): Project {
  const target = targetVersionOf(options)
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

  const registryMigrations = options.registryMigrations ?? REGISTRY_MIGRATIONS
  working = applyRegistryMigrations(working, registryMigrations)

  return working as unknown as Project
}
