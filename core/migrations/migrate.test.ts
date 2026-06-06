import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createEmptyProject } from '../model/factories'
import type { Project } from '../model/types'
import { migrateProject } from './migrate'
import { UnsupportedSchemaVersionError } from './types'

function makeCurrentProject(): Project {
  return createEmptyProject({
    name: 'Test House',
    units: 'imperial',
    era: 'victorian',
    appVersion: '0.1.0',
  })
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
})
