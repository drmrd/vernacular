import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, decodeDocument } from '../../core'
import type { SchemaMigration } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { storedVersionOf } from './document-backups'

const OLDER_VERSION = 15
const NEXT_VERSION = CURRENT_SCHEMA_VERSION + 1
const NOT_A_PROJECT_VERSION = 0

describe('storedVersionOf', () => {
  it('gives the version that a document was migrated from', () => {
    const migrated = decodeDocument(versionFixtureBytes(OLDER_VERSION))
    const refused = decodeDocument(bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION))))

    expect(storedVersionOf(migrated)).toBe(OLDER_VERSION)
    expect(storedVersionOf(refused)).toBe(OLDER_VERSION)
  })

  it('gives the current version for a document that was not migrated', () => {
    const sound = decodeDocument(versionFixtureBytes(CURRENT_SCHEMA_VERSION))
    const refused = decodeDocument(
      bytesOf(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))),
    )

    expect(storedVersionOf(sound)).toBe(CURRENT_SCHEMA_VERSION)
    expect(storedVersionOf(refused)).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('gives the version of a document from a newer build', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).schemaVersion = NEXT_VERSION

    expect(storedVersionOf(decodeDocument(bytesOf(document)))).toBe(NEXT_VERSION)
  })

  it('gives the starting version of a migration that failed', () => {
    const throwingStep: SchemaMigration = {
      from: OLDER_VERSION,
      migrate: () => {
        throw new Error('the step broke')
      },
    }

    const failed = decodeDocument(versionFixtureBytes(OLDER_VERSION), {
      migration: { schemaMigrations: [throwingStep] },
    })

    expect(storedVersionOf(failed)).toBe(OLDER_VERSION)
  })

  it('gives 0 for bytes that are no project', () => {
    const notJson = decodeDocument(new TextEncoder().encode('this is not json'))
    const notAProject = decodeDocument(new TextEncoder().encode('{"floors":[]}'))

    expect(storedVersionOf(notJson)).toBe(NOT_A_PROJECT_VERSION)
    expect(storedVersionOf(notAProject)).toBe(NOT_A_PROJECT_VERSION)
  })
})
