import { describe, expect, it } from 'vitest'
import {
  VERSION_FIXTURE_VERSIONS,
  versionFixtureBytes,
} from '../../../tests/fixtures/projects/versions'
import {
  atHigherRevision,
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
import type { Project, ProjectShape, RegistryMigration } from '../../index'
import type { CodecOptions, DecodeFailure, DecodeResult } from './codec-types'
import { decodeDocument } from './decode-document'
import { encodeDocument } from './encode-document'

const OLDER_VERSION = 8
const REVISION_OF_AN_OLDER_FILE = 3
const VERSION_NO_STEP_STARTS_FROM = 0
const UNKNOWN_ROOT_FIELD = 'x-unknown-root'
const REGISTRY = 'example-registry'
const REGISTRY_VERSION_BEHIND = 1
const LEGACY = 'legacy'

const encodeText = (text: string): Uint8Array => new TextEncoder().encode(text)

function failureOf(result: DecodeResult): DecodeFailure {
  if (result.ok) throw new Error('Expected the decode to fail, and it succeeded')
  return result.failure
}

function writtenJson(bytes: Uint8Array): Json {
  return JSON.parse(new TextDecoder().decode(bytes))
}

function firstWallOfProject(project: Project): Json {
  const wall = project.floors[0]?.walls[0]
  if (wall === undefined) throw new Error('The project has no wall')
  return wall as unknown as Json
}

function withRevision(project: Project, revision: number): Project {
  return { ...project, meta: { ...project.meta, schemaRevision: revision } }
}

function writtenRevision(project: Project, previous?: Uint8Array): unknown {
  return metaOf(writtenJson(encodeDocument(project, previous).bytes)).schemaRevision
}

describe('the revision that encode writes', () => {
  it('writes the revision of this build into meta.schemaRevision', () => {
    const project = projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION))
    expect(writtenRevision(project)).toBe(CURRENT_SCHEMA_REVISION)
  })

  it('keeps a higher revision of the same version instead of lowering it', () => {
    const project = projectOf(bytesOf(atHigherRevision(fixtureDocument(CURRENT_SCHEMA_VERSION))))
    expect(writtenRevision(project)).toBe(HIGHER_REVISION)
  })

  it('drops, on decode, the revision that an older document named, so it is written at this build revision', () => {
    const document = fixtureDocument(OLDER_VERSION)
    metaOf(document).schemaRevision = REVISION_OF_AN_OLDER_FILE
    expect(writtenRevision(projectOf(bytesOf(document)))).toBe(CURRENT_SCHEMA_REVISION)
  })
})

describe('encoding a document that was read at a higher revision', () => {
  it('reports no fault, and its unknown field survives a second decode', () => {
    const document = atHigherRevision(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION)))
    const project = projectOf(bytesOf(document))

    const encoded = encodeDocument(project, undefined)

    expect(encoded.faults).toEqual([])
    expect(firstWallOfProject(projectOf(encoded.bytes))[UNKNOWN_FIELD]).toBe(1)
  })
})

describe('encoding a document with an unknown field at the current revision', () => {
  it('reports faults and still returns bytes that hold the document', () => {
    const project = structuredClone(projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION)))
    firstWallOfProject(project)[UNKNOWN_FIELD] = 1

    const encoded = encodeDocument(project, undefined)

    const fault = encoded.faults.find((candidate) => candidate.path === UNKNOWN_WALL_FIELD_PATH)
    expect(fault?.rule).toBe('additionalProperties')
    expect(writtenJson(encoded.bytes)).toEqual(withRevision(project, CURRENT_SCHEMA_REVISION))
  })
})

describe('grafting the unknown keys of the previous bytes', () => {
  it('keeps an unknown key on a wall and at the root of the previous bytes', () => {
    const previous = atHigherRevision(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION)))
    previous[UNKNOWN_ROOT_FIELD] = { kept: true }
    const project = projectOf(bytesOf(atHigherRevision(fixtureDocument(CURRENT_SCHEMA_VERSION))))

    const written = writtenJson(encodeDocument(project, bytesOf(previous)).bytes)

    expect(written[UNKNOWN_ROOT_FIELD]).toEqual({ kept: true })
    expect(firstWallOf(written)[UNKNOWN_FIELD]).toBe(1)
  })
})

function previousAtVersion(version: number): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).schemaVersion = version
  return bytesOf(document)
}

const PREVIOUS_THAT_CANNOT_BE_GRAFTED = [
  { kind: 'not-json', previous: encodeText('{ this is not json') },
  { kind: 'not-a-project', previous: encodeText('{}') },
  { kind: 'newer-version', previous: previousAtVersion(CURRENT_SCHEMA_VERSION + 1) },
  { kind: 'migration-failed', previous: previousAtVersion(VERSION_NO_STEP_STARTS_FROM) },
]

describe('previous bytes that fail to decode', () => {
  it.each(PREVIOUS_THAT_CANNOT_BE_GRAFTED)(
    'are ignored when the failure is $kind, and the failure is reported as it is',
    ({ kind, previous }) => {
      const project = projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION))
      const decodeFailure = failureOf(decodeDocument(previous))

      const encoded = encodeDocument(project, previous)

      expect(decodeFailure.kind).toBe(kind)
      expect(encoded.faults).toEqual([])
      expect(projectOf(encoded.bytes)).toEqual(withRevision(project, CURRENT_SCHEMA_REVISION))
      expect(encoded.graftDropped).toEqual(decodeFailure)
    },
  )
})

describe.each(VERSION_FIXTURE_VERSIONS)('encoding the decoded version %i fixture', (version) => {
  it('decodes to the same project, now at the revision of this build', () => {
    const bytes = versionFixtureBytes(version)
    const first = projectOf(bytes)

    const second = projectOf(encodeDocument(first, bytes).bytes)

    expect(second).toEqual(withRevision(first, CURRENT_SCHEMA_REVISION))
  })
})

const dropsLegacyFromExtensions: RegistryMigration = {
  registry: REGISTRY,
  from: REGISTRY_VERSION_BEHIND,
  migrate: (project: ProjectShape): ProjectShape => {
    const extensions = Object.entries(project.extensions as Json)
    return {
      ...project,
      extensions: Object.fromEntries(extensions.filter(([key]) => key !== LEGACY)),
    }
  },
}

function storedDocumentOneRegistryVersionBehind(): Json {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).registryVersions = { [REGISTRY]: REGISTRY_VERSION_BEHIND }
  document.extensions = { ...(document.extensions as Json), [LEGACY]: 'left behind' }
  return document
}

describe('bringing the previous file current before the graft', () => {
  it('does not bring back a key that a pending registry migration dropped', () => {
    const options: CodecOptions = { migration: { registryMigrations: [dropsLegacyFromExtensions] } }
    const stored = bytesOf(storedDocumentOneRegistryVersionBehind())
    const project = projectOf(stored, options)

    const encoded = encodeDocument(project, stored, options)

    expect(projectOf(encoded.bytes, options).extensions ?? {}).not.toHaveProperty(LEGACY)
  })
})
