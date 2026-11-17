import { describe, expect, it } from 'vitest'
import { versionFixtureBytes } from '../../../tests/fixtures/projects/versions'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  projectOf,
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
} from '../../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../../tests/fixtures/projects/versions/fixture-documents'
import { CURRENT_SCHEMA_REVISION, CURRENT_SCHEMA_VERSION } from '../../index'
import type { Project, ProjectShape, RegistryMigration, SchemaMigration } from '../../index'
import type { CodecOptions } from './codec-types'
import { encodeDocument } from './encode-document'

const OLDER_VERSION = 8
const REGISTRY = 'example-registry'
const REGISTRY_STEP_STARTS_AT = 1
const REGISTRY_VERSION_AHEAD_OF_STEP = 2
const REVISION_THAT_IS_NOT_WHOLE = 1.5
const REVISION_THAT_IS_A_STRING = '2'

function writtenRevision(bytes: Uint8Array): unknown {
  const written = JSON.parse(new TextDecoder().decode(bytes)) as { meta: Json }
  return written.meta.schemaRevision
}

function currentProjectWithUnknownWallField(): Project {
  const project = structuredClone(projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION)))
  const wall = project.floors[0]?.walls[0]
  if (wall === undefined) throw new Error('The project has no wall')
  Object.assign(wall, { [UNKNOWN_FIELD]: 1 })
  return project
}

describe('encoding does not change what it is given', () => {
  it('leaves the project and the previous bytes as they were', () => {
    const previous = versionFixtureBytes(OLDER_VERSION)
    const project = projectOf(previous)
    const projectBefore = structuredClone(project)
    const previousBefore = previous.slice()

    encodeDocument(project, previous, {})

    expect(project).toEqual(projectBefore)
    expect(previous).toEqual(previousBefore)
  })
})

describe('encoding a project whose revision is not a usable revision', () => {
  it.each([
    { name: 'a fraction', revision: REVISION_THAT_IS_NOT_WHOLE },
    { name: 'a string', revision: REVISION_THAT_IS_A_STRING },
  ])(
    'treats $name as revision 0, writes this build revision, and checks strictly',
    ({ revision }) => {
      const project = currentProjectWithUnknownWallField()
      Object.assign(project.meta, { schemaRevision: revision })

      const encoded = encodeDocument(project, undefined)

      expect(writtenRevision(encoded.bytes)).toBe(CURRENT_SCHEMA_REVISION)
      expect(encoded.faults.map((fault) => fault.path)).toContain(UNKNOWN_WALL_FIELD_PATH)
    },
  )

  it('writes this build revision for a project at revision 0', () => {
    const project = projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION))
    Object.assign(project.meta, { schemaRevision: 0 })

    expect(writtenRevision(encodeDocument(project, undefined).bytes)).toBe(CURRENT_SCHEMA_REVISION)
  })
})

interface Counter {
  calls: number
}

function countingOptions(counter: Counter): CodecOptions {
  const step = (project: ProjectShape): ProjectShape => {
    counter.calls += 1
    return project
  }
  const schemaStep: SchemaMigration = { from: CURRENT_SCHEMA_VERSION - 1, migrate: step }
  const registryStep: RegistryMigration = {
    registry: REGISTRY,
    from: REGISTRY_STEP_STARTS_AT,
    migrate: step,
  }
  return { migration: { schemaMigrations: [schemaStep], registryMigrations: [registryStep] } }
}

function previousWithRegistryAt(version: number): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).registryVersions = { [REGISTRY]: version }
  return bytesOf(document)
}

function stepCallsDuringEncode(previous: Uint8Array): number {
  const counter: Counter = { calls: 0 }
  encodeDocument(projectOf(previous), previous, countingOptions(counter))
  return counter.calls
}

describe('which steps run on the previous bytes during encode', () => {
  it('runs none when the recorded registry version is not one that its step starts from', () => {
    expect(stepCallsDuringEncode(previousWithRegistryAt(REGISTRY_VERSION_AHEAD_OF_STEP))).toBe(0)
  })

  it('runs the registry step once when the previous bytes record the version it starts from', () => {
    expect(stepCallsDuringEncode(previousWithRegistryAt(REGISTRY_STEP_STARTS_AT))).toBe(1)
  })
})
