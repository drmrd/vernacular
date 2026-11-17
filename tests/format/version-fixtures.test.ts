import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createDocumentValidator } from '../../core'
import type { DocumentValidationResult } from '../../core'
import type { DecodeResult } from '../../core/format/codec/codec-types'
import { decodeDocument } from '../../core/format/codec/decode-document'
import { VERSION_FIXTURE_VERSIONS, versionFixtureBytes } from '../fixtures/projects/versions'
import { missingSchemaPaths } from './version-fixture-coverage'
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

function decodeFixture(version: number): DecodeResult {
  return decodeDocument(versionFixtureBytes(version))
}

function describeDecodeFailure(version: number, result: DecodeResult): string {
  const heading = `The version ${version} fixture does not decode:`
  if (result.ok) return heading
  const failure = result.failure
  if (failure.kind !== 'format-rules')
    return `${heading} ${failure.kind} ${JSON.stringify(failure)}`
  const lines = failure.faults.map(
    (fault) => `  ${fault.path || '(document root)'} ${fault.rule} ${fault.message}`,
  )
  return [`${heading} ${failure.kind}`, ...lines].join('\n')
}

function decodedRoomKeys(version: number): string[] {
  const result = decodeFixture(version)
  if (!result.ok) throw new Error(describeDecodeFailure(version, result))
  return Object.keys(result.value.project.roomOverrides ?? {}).sort()
}

function currentRoomKeys(): string[] {
  const rooms = loadFixture(CURRENT_SCHEMA_VERSION).roomOverrides as object | undefined
  return Object.keys(rooms ?? {}).sort()
}

function describeMissingPaths(version: number, missing: readonly string[]): string {
  const lines = missing.map((path) => `  ${path}`)
  return [
    `The version ${version} fixture never carries ${missing.length} path(s) that ${schemaPath(version)} requires:`,
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

    it('decodes to a document that the current schema accepts', () => {
      const result = decodeFixture(version)
      expect(result.ok, describeDecodeFailure(version, result)).toBe(true)
    })

    it('decodes to the room override keys of the current fixture', () => {
      const actual = decodedRoomKeys(version)
      const expected = currentRoomKeys()
      const message = `The version ${version} fixture decodes to room override keys [${actual.join(', ')}], and the version ${CURRENT_SCHEMA_VERSION} fixture holds [${expected.join(', ')}]`
      expect(actual, message).toEqual(expected)
    })

    it('carries every property, collection and union variant that its version declares', () => {
      const missing = missingSchemaPaths(loadSchema(version), loadFixture(version))
      expect(missing, describeMissingPaths(version, missing)).toEqual([])
    })
  })
})
