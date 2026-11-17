import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createDocumentValidator, migrateProject } from '../../core'
import type { DocumentValidationResult } from '../../core'
import { VERSION_FIXTURE_VERSIONS, versionFixtureBytes } from '../fixtures/projects/versions'
import { missingElementKinds } from './version-fixture-coverage'
import type { RootSchema } from './version-fixture-coverage'

/** The oldest schema version that is published under schema/. */
const OLDEST_PUBLISHED_SCHEMA_VERSION = 8

const EVERY_PUBLISHED_VERSION: readonly number[] = Array.from(
  { length: CURRENT_SCHEMA_VERSION - OLDEST_PUBLISHED_SCHEMA_VERSION + 1 },
  (_, offset) => OLDEST_PUBLISHED_SCHEMA_VERSION + offset,
)

function schemaPath(version: number): string {
  return `schema/${version}/vernacular.schema.json`
}

function loadSchema(version: number): RootSchema {
  return JSON.parse(readFileSync(resolve(schemaPath(version)), 'utf8'))
}

function loadFixture(version: number): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(versionFixtureBytes(version)))
}

function listErrors(heading: string, result: DocumentValidationResult): string {
  const lines = result.errors.map(
    (error) =>
      `  ${error.instancePath || '(document root)'} ${error.message} ${JSON.stringify(error.params)}`,
  )
  return [heading, ...lines].join('\n')
}

function describeSchemaErrors(version: number, result: DocumentValidationResult): string {
  return listErrors(`The version ${version} fixture breaks ${schemaPath(version)}:`, result)
}

function describeMigratedErrors(version: number, result: DocumentValidationResult): string {
  const heading = `The version ${version} fixture migrates to a document that breaks ${schemaPath(CURRENT_SCHEMA_VERSION)}:`
  return listErrors(heading, result)
}

/** Migrate the fixture with default options; a throw becomes a result that names the version. */
function validateMigrated(version: number): { result: DocumentValidationResult; message: string } {
  const validate = createDocumentValidator(loadSchema(CURRENT_SCHEMA_VERSION))
  try {
    const result = validate(migrateProject(loadFixture(version)))
    return { result, message: describeMigratedErrors(version, result) }
  } catch (error) {
    const thrown = error instanceof Error ? error.message : String(error)
    const message = `The version ${version} fixture made migrateProject throw: ${thrown}`
    return { result: { valid: false, errors: [] }, message }
  }
}

function describeMissingKinds(version: number, missing: readonly string[]): string {
  const lines = missing.map((path) => `  ${path}`)
  return [
    `The version ${version} fixture lacks an instance of each element kind that ${schemaPath(version)} defines:`,
    ...lines,
  ].join('\n')
}

describe('the fixtures for every schema version', () => {
  it('cover each version from the oldest published one to the current one', () => {
    expect(VERSION_FIXTURE_VERSIONS).toEqual(EVERY_PUBLISHED_VERSION)
  })

  describe.each(EVERY_PUBLISHED_VERSION)('the version %i fixture', (version) => {
    it('declares its own schema version', () => {
      const meta = loadFixture(version).meta as { schemaVersion?: unknown } | undefined
      expect(
        meta?.schemaVersion,
        `The version ${version} fixture declares another meta.schemaVersion`,
      ).toBe(version)
    })

    it('conforms to the published schema of its version', () => {
      const result = createDocumentValidator(loadSchema(version))(loadFixture(version))
      expect(result.valid, describeSchemaErrors(version, result)).toBe(true)
    })

    it('migrates to a document that the current schema accepts', () => {
      const { result, message } = validateMigrated(version)
      expect(result.valid, message).toBe(true)
    })

    it('carries at least one instance of every element kind that its version defines', () => {
      const missing = missingElementKinds(loadSchema(version), loadFixture(version))
      expect(missing, describeMissingKinds(version, missing)).toEqual([])
    })
  })
})
