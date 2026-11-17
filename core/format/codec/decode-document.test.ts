import { describe, expect, it } from 'vitest'
import {
  VERSION_FIXTURE_VERSIONS,
  versionFixtureBytes,
} from '../../../tests/fixtures/projects/versions'
import { CURRENT_SCHEMA_REVISION, CURRENT_SCHEMA_VERSION } from '../../index'
import type { SchemaMigration } from '../../index'
import type { DecodedDocument, DecodeFailure, DecodeResult } from './codec-types'
import { decodeDocument } from './decode-document'

const OLDER_VERSION = 8
const NEWER_BUILD_REVISION = CURRENT_SCHEMA_REVISION + 1
const REVISION_OF_AN_OLDER_FILE = 3
const UNKNOWN_FIELD = 'x-unknown'
const NAMESPACE = 'com.example.solar'
const UNKNOWN_WALL_FIELD_PATH = `/floors/0/walls/0/${UNKNOWN_FIELD}`

type Json = Record<string, unknown>

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

function fixtureDocument(version: number): Json {
  return JSON.parse(new TextDecoder().decode(versionFixtureBytes(version)))
}

function bytesOf(document: unknown): Uint8Array {
  return encode(JSON.stringify(document))
}

function failureOf(result: DecodeResult): DecodeFailure {
  if (result.ok) throw new Error('Expected the decode to fail, and it succeeded')
  return result.failure
}

function valueOf(result: DecodeResult): DecodedDocument {
  if (!result.ok) {
    throw new Error(
      `Expected the decode to succeed, and it failed: ${JSON.stringify(result.failure)}`,
    )
  }
  return result.value
}

function metaOf(document: Json): Json {
  return document.meta as Json
}

function paintOf(document: Json): Record<string, Json> {
  return document.paint as Record<string, Json>
}

function firstWallOf(document: Json): Json {
  const floors = document.floors as { walls: Json[] }[]
  const wall = floors[0]?.walls[0]
  if (wall === undefined) throw new Error('The fixture has no wall')
  return wall
}

function paintKeyOfKind(document: Json, kind: string): string {
  const key = Object.keys(paintOf(document)).find((k) => paintOf(document)[k]?.kind === kind)
  if (key === undefined) throw new Error(`The fixture has no paint entry of kind ${kind}`)
  return key
}

function withUnknownWallField(document: Json): Json {
  firstWallOf(document)[UNKNOWN_FIELD] = 1
  return document
}

function atNewerRevision(document: Json): Json {
  metaOf(document).schemaRevision = NEWER_BUILD_REVISION
  return document
}

describe('decoding bytes that are not a project', () => {
  it('reports bytes that are not JSON as not-json with a message', () => {
    const failure = failureOf(decodeDocument(encode('{ this is not json')))
    expect(failure.kind).toBe('not-json')
    if (failure.kind === 'not-json') expect(failure.message).not.toBe('')
  })

  it.each([
    { name: 'an empty array', text: '[]' },
    { name: 'null', text: 'null' },
    { name: 'a string', text: '"x"' },
    { name: 'an empty object', text: '{}' },
  ])('reports JSON that is $name as not-a-project', ({ text }) => {
    expect(failureOf(decodeDocument(encode(text)))).toEqual({ kind: 'not-a-project' })
  })
})

describe('decoding a document by its schema version', () => {
  it('refuses a version above the build and names both versions', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1
    expect(failureOf(decodeDocument(bytesOf(document)))).toEqual({
      kind: 'newer-version',
      version: CURRENT_SCHEMA_VERSION + 1,
      buildVersion: CURRENT_SCHEMA_VERSION,
    })
  })

  it('reports a schema step that throws as migration-failed with the stored version', () => {
    const throwingStep: SchemaMigration = {
      from: OLDER_VERSION,
      migrate: () => {
        throw new Error('the step broke')
      },
    }
    const result = decodeDocument(bytesOf(fixtureDocument(OLDER_VERSION)), {
      migration: { schemaMigrations: [throwingStep] },
    })
    const failure = failureOf(result)
    expect(failure.kind).toBe('migration-failed')
    if (failure.kind === 'migration-failed') {
      expect(failure.fromVersion).toBe(OLDER_VERSION)
      expect(failure.message).not.toBe('')
    }
  })
})

describe.each(VERSION_FIXTURE_VERSIONS)('decoding the version %i fixture', (version) => {
  it('gives a project of the current version, and says where it migrated from', () => {
    const value = valueOf(decodeDocument(versionFixtureBytes(version)))
    expect(value.project.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(value.migratedFrom).toBe(version < CURRENT_SCHEMA_VERSION ? version : undefined)
    expect(value.savedByNewerBuild).toBe(false)
  })
})

describe('decoding a document at the current revision', () => {
  it('reports an unknown field on a wall as a format fault at the field itself', () => {
    const document = withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))
    const failure = failureOf(decodeDocument(bytesOf(document)))
    expect(failure.kind).toBe('format-rules')
    if (failure.kind !== 'format-rules') return
    const fault = failure.faults.find((candidate) => candidate.path === UNKNOWN_WALL_FIELD_PATH)
    expect(fault?.rule).toBe('additionalProperties')
    expect(failure.document).toEqual(document)
    expect(failure.migratedFrom).toBeUndefined()
  })

  it('reports a paint entry that carries a field of another variant as a format fault', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    paintOf(document)[paintKeyOfKind(document, 'solid')]!.patternId = 'plank'
    expect(failureOf(decodeDocument(bytesOf(document))).kind).toBe('format-rules')
  })

  it('accepts any key inside extensions', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    document.extensions = { [NAMESPACE]: { panelKilowatts: 6.4, [UNKNOWN_FIELD]: [1, 2] } }
    expect(decodeDocument(bytesOf(document)).ok).toBe(true)
  })
})

describe('decoding a document saved at a higher revision', () => {
  it('keeps an unknown field on a wall and says that a newer build saved it', () => {
    const document = atNewerRevision(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION)))
    const value = valueOf(decodeDocument(bytesOf(document)))
    expect((value.project.floors[0]?.walls[0] as Json)[UNKNOWN_FIELD]).toBe(1)
    expect(value.savedByNewerBuild).toBe(true)
  })

  it('keeps an unknown field inside a paint entry and says that a newer build saved it', () => {
    const document = atNewerRevision(fixtureDocument(CURRENT_SCHEMA_VERSION))
    const key = paintKeyOfKind(document, 'solid')
    paintOf(document)[key]![UNKNOWN_FIELD] = true
    const value = valueOf(decodeDocument(bytesOf(document)))
    expect((value.project.paint[key] as Json)[UNKNOWN_FIELD]).toBe(true)
    expect(value.savedByNewerBuild).toBe(true)
  })
})

describe('decoding an older document that names a revision', () => {
  it('drops the revision, because it resets when the version rises', () => {
    const document = fixtureDocument(OLDER_VERSION)
    metaOf(document).schemaRevision = REVISION_OF_AN_OLDER_FILE
    const value = valueOf(decodeDocument(bytesOf(document)))
    expect(value.migratedFrom).toBe(OLDER_VERSION)
    expect(value.savedByNewerBuild).toBe(false)
    expect(value.project.meta.schemaRevision ?? 0).toBe(0)
  })
})
