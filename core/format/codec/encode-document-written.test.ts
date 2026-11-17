import { describe, expect, it } from 'vitest'
import { versionFixtureBytes } from '../../../tests/fixtures/projects/versions'
import { CURRENT_SCHEMA_REVISION, CURRENT_SCHEMA_VERSION } from '../../index'
import type { Project } from '../../index'
import { decodeDocument } from './decode-document'
import { encodeDocument } from './encode-document'

const HIGHER_REVISION = CURRENT_SCHEMA_REVISION + 1
const UNKNOWN_FIELD = 'x-unknown'
const UNKNOWN_ROOT_FIELD = 'x-unknown-root'
const UNKNOWN_ROOT_VALUE = { kept: true }
const UNKNOWN_WALL_FIELD_PATH = `/floors/0/walls/0/${UNKNOWN_FIELD}`

type Json = Record<string, unknown>

const encodeText = (text: string): Uint8Array => new TextEncoder().encode(text)

function fixtureDocument(): Json {
  return JSON.parse(new TextDecoder().decode(versionFixtureBytes(CURRENT_SCHEMA_VERSION)))
}

function bytesOf(document: unknown): Uint8Array {
  return encodeText(JSON.stringify(document))
}

function writtenJson(bytes: Uint8Array): Json {
  return JSON.parse(new TextDecoder().decode(bytes))
}

function metaOf(document: Json): Json {
  return document.meta as Json
}

function firstWallOf(document: Json): Json {
  const floors = document.floors as { walls: Json[] }[]
  const wall = floors[0]?.walls[0]
  if (wall === undefined) throw new Error('The document has no wall')
  return wall
}

/** The current fixture as a project, whose revision is the given one, or absent when undefined. */
function projectAtRevision(revision: number | undefined): Project {
  const result = decodeDocument(versionFixtureBytes(CURRENT_SCHEMA_VERSION))
  if (!result.ok)
    throw new Error(`Expected the decode to succeed: ${JSON.stringify(result.failure)}`)
  const project = structuredClone(result.value.project)
  const meta = project.meta as unknown as Json
  if (revision === undefined) delete meta.schemaRevision
  else meta.schemaRevision = revision
  return project
}

/** The previous bytes: the current fixture at `revision`, with an unknown key on wall 0. */
function previousWithUnknownWallField(revision: number): Json {
  const document = fixtureDocument()
  metaOf(document).schemaRevision = revision
  firstWallOf(document)[UNKNOWN_FIELD] = 1
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
