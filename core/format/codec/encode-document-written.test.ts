import { describe, expect, it } from 'vitest'
import { versionFixtureBytes } from '../../../tests/fixtures/projects/versions'
import {
  bytesOf,
  firstWallOf,
  fixtureDocument,
  HIGHER_REVISION,
  metaOf,
  projectOf,
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
  withUnknownWallField,
} from '../../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../../tests/fixtures/projects/versions/fixture-documents'
import { CURRENT_SCHEMA_REVISION, CURRENT_SCHEMA_VERSION } from '../../index'
import type { Project } from '../../index'
import { decodeDocument } from './decode-document'
import { encodeDocument } from './encode-document'

const UNKNOWN_ROOT_FIELD = 'x-unknown-root'
const UNKNOWN_ROOT_VALUE = { kept: true }

function writtenJson(bytes: Uint8Array): Json {
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** The current fixture as a project, whose revision is the given one, or absent when undefined. */
function projectAtRevision(revision: number | undefined): Project {
  const project = projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION))
  const meta = project.meta as unknown as Json
  if (revision === undefined) delete meta.schemaRevision
  else meta.schemaRevision = revision
  return project
}

/** The previous bytes: the current fixture at `revision`, with an unknown key on wall 0. */
function previousWithUnknownWallField(revision: number): Json {
  const document = withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))
  metaOf(document).schemaRevision = revision
  return document
}

describe('encoding over previous bytes that a newer build saved', () => {
  it.each([
    { name: 'the revision of this build', revision: CURRENT_SCHEMA_REVISION },
    { name: 'no revision', revision: undefined },
  ])(
    'stamps the revision of the previous bytes on the written document when the project has $name',
    ({ revision }) => {
      const previous = previousWithUnknownWallField(HIGHER_REVISION)
      previous[UNKNOWN_ROOT_FIELD] = UNKNOWN_ROOT_VALUE

      const encoded = encodeDocument(projectAtRevision(revision), bytesOf(previous))

      const written = writtenJson(encoded.bytes)
      expect(firstWallOf(written)[UNKNOWN_FIELD]).toBe(1)
      expect(written[UNKNOWN_ROOT_FIELD]).toEqual(UNKNOWN_ROOT_VALUE)
      expect(metaOf(written).schemaRevision).toBe(HIGHER_REVISION)
      expect(encoded.faults).toEqual([])
      const decoded = decodeDocument(encoded.bytes)
      expect(decoded.ok && decoded.value.savedByNewerBuild).toBe(true)
    },
  )
})

describe('encoding over previous bytes of this revision that break the format rules', () => {
  it('checks the document that it writes, so the grafted field is a fault', () => {
    const previous = previousWithUnknownWallField(CURRENT_SCHEMA_REVISION)

    const encoded = encodeDocument(projectAtRevision(CURRENT_SCHEMA_REVISION), bytesOf(previous))

    expect(firstWallOf(writtenJson(encoded.bytes))[UNKNOWN_FIELD]).toBe(1)
    expect(encoded.faults.map((fault) => fault.path)).toContain(UNKNOWN_WALL_FIELD_PATH)
  })
})

const OLDER_VERSION = 16
const REVISION_OF_AN_OLDER_FILE = 5

describe('encoding over previous bytes of an older schema version', () => {
  it.each([
    { name: 'the revision of this build', revision: CURRENT_SCHEMA_REVISION },
    { name: 'no revision', revision: undefined },
  ])(
    'writes the revision of this build, not the one the older file named, when the project has $name',
    ({ revision }) => {
      const previous = fixtureDocument(OLDER_VERSION)
      metaOf(previous).schemaRevision = REVISION_OF_AN_OLDER_FILE

      const encoded = encodeDocument(projectAtRevision(revision), bytesOf(previous))

      expect(metaOf(writtenJson(encoded.bytes)).schemaRevision).toBe(CURRENT_SCHEMA_REVISION)
      expect(encoded.faults).toEqual([])
    },
  )
})
