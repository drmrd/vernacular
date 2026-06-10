import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createEmptyProject } from '../model/factories'
import type { Project } from '../model/types'
import { migrateProject } from './migrate'
import type { ProjectShape, RegistryMigration, SchemaMigration } from './types'
import { MalformedProjectError, MigrationFailedError, UnsupportedSchemaVersionError } from './types'

function makeCurrentProject(): Project {
  return createEmptyProject({
    name: 'Test House',
    units: 'imperial',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

/**
 * Builds a synthetic schema migration that appends `breadcrumb` to a `trail`
 * array on the project, returning a fresh object so the migration stays pure
 * (it never mutates its argument) and the orchestrator owns the version number.
 */
function appendTrailMigration(from: number, breadcrumb: string): SchemaMigration {
  return {
    from,
    migrate(project: ProjectShape): ProjectShape {
      const trail = Array.isArray(project.trail) ? (project.trail as string[]) : []
      return { ...project, trail: [...trail, breadcrumb] }
    },
  }
}

function makeVersionedDocument(schemaVersion: unknown): Record<string, unknown> {
  return { meta: { schemaVersion }, trail: [] }
}

/**
 * Builds a synthetic registry migration that appends `breadcrumb` to the same
 * `trail` array the schema migrations use, returning a fresh object so the
 * migration stays pure and the orchestrator owns the registry version number.
 */
function appendTrailRegistryMigration(
  registry: string,
  from: number,
  breadcrumb: string,
): RegistryMigration {
  return {
    registry,
    from,
    migrate(project: ProjectShape): ProjectShape {
      const trail = Array.isArray(project.trail) ? (project.trail as string[]) : []
      return { ...project, trail: [...trail, breadcrumb] }
    },
  }
}

function makeRegistryDocument(
  schemaVersion: number,
  registryVersions: Record<string, number>,
): Record<string, unknown> {
  return { meta: { schemaVersion, registryVersions }, trail: [] }
}

describe('migrateProject', () => {
  it('returns a current-version project unchanged under the default empty chains', () => {
    const project = makeCurrentProject()
    const before = structuredClone(project)

    const migrated = migrateProject(project)

    expect(migrated).toEqual(before)
    expect(project).toEqual(before)
  })

  it('throws UnsupportedSchemaVersionError for a document newer than the target', () => {
    const project = makeCurrentProject()
    const newerVersion = CURRENT_SCHEMA_VERSION + 1
    const document = {
      ...project,
      meta: { ...project.meta, schemaVersion: newerVersion },
    }

    expect(() => migrateProject(document, { targetVersion: CURRENT_SCHEMA_VERSION })).toThrow(
      UnsupportedSchemaVersionError,
    )

    let thrown: unknown
    try {
      migrateProject(document, { targetVersion: CURRENT_SCHEMA_VERSION })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(UnsupportedSchemaVersionError)
    const error = thrown as UnsupportedSchemaVersionError
    expect(error.fromVersion).toBe(newerVersion)
    expect(error.targetVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('applies injected schema migrations in ascending order, feeding each the previous output', () => {
    const document = makeVersionedDocument(1)
    const schemaMigrations = [appendTrailMigration(1, 'v1->v2'), appendTrailMigration(2, 'v2->v3')]

    const migrated = migrateProject(document, { schemaMigrations, targetVersion: 3 })

    expect((migrated as unknown as { trail: string[] }).trail).toEqual(['v1->v2', 'v2->v3'])
    expect(migrated.meta.schemaVersion).toBe(3)
  })

  it('throws MigrationFailedError at the first missing step in the chain', () => {
    const document = makeVersionedDocument(1)
    const schemaMigrations = [appendTrailMigration(1, 'v1->v2')]

    let thrown: unknown
    try {
      migrateProject(document, { schemaMigrations, targetVersion: 3 })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(MigrationFailedError)
    expect((thrown as MigrationFailedError).fromVersion).toBe(2)
  })

  it('throws MalformedProjectError when the document has no meta', () => {
    let thrown: unknown
    try {
      migrateProject({})
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(MalformedProjectError)
  })

  it('throws MalformedProjectError when meta.schemaVersion is not a number', () => {
    let thrown: unknown
    try {
      migrateProject(makeVersionedDocument('1'))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(MalformedProjectError)
  })

  it('applies a pending registry migration and advances that registry version', () => {
    const document = makeRegistryDocument(CURRENT_SCHEMA_VERSION, { finishes: 0 })
    const registryMigrations = [appendTrailRegistryMigration('finishes', 0, 'finishes:0->1')]

    const migrated = migrateProject(document, {
      registryMigrations,
      targetVersion: CURRENT_SCHEMA_VERSION,
    })

    expect((migrated as unknown as { trail: string[] }).trail).toEqual(['finishes:0->1'])
    expect(migrated.meta.registryVersions.finishes).toBe(1)
  })

  it('chains consecutive registry migrations for one registry in ascending order', () => {
    const document = makeRegistryDocument(CURRENT_SCHEMA_VERSION, { finishes: 0 })
    const registryMigrations = [
      appendTrailRegistryMigration('finishes', 0, 'finishes:0->1'),
      appendTrailRegistryMigration('finishes', 1, 'finishes:1->2'),
    ]

    const migrated = migrateProject(document, {
      registryMigrations,
      targetVersion: CURRENT_SCHEMA_VERSION,
    })

    expect((migrated as unknown as { trail: string[] }).trail).toEqual([
      'finishes:0->1',
      'finishes:1->2',
    ])
    expect(migrated.meta.registryVersions.finishes).toBe(2)
  })

  it('runs the registry pass only after the schema chain completes', () => {
    const document = makeRegistryDocument(1, { finishes: 0 })
    const schemaMigrations = [appendTrailMigration(1, 'schema')]
    const registryMigrations = [appendTrailRegistryMigration('finishes', 0, 'registry')]

    const migrated = migrateProject(document, {
      schemaMigrations,
      registryMigrations,
      targetVersion: 2,
    })

    expect((migrated as unknown as { trail: string[] }).trail).toEqual(['schema', 'registry'])
    expect(migrated.meta.schemaVersion).toBe(2)
    expect(migrated.meta.registryVersions.finishes).toBe(1)
  })

  it('leaves a registry untouched when no migration matches its current version', () => {
    const document = makeRegistryDocument(CURRENT_SCHEMA_VERSION, { finishes: 2 })
    const registryMigrations = [appendTrailRegistryMigration('finishes', 0, 'finishes:0->1')]

    const migrated = migrateProject(document, {
      registryMigrations,
      targetVersion: CURRENT_SCHEMA_VERSION,
    })

    expect((migrated as unknown as { trail: string[] }).trail).toEqual([])
    expect(migrated.meta.registryVersions.finishes).toBe(2)
  })
})
