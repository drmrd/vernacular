import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bytesOf, metaOf } from '../fixtures/projects/versions/fixture-documents'
import type { Json } from '../fixtures/projects/versions/fixture-documents'
import {
  CURRENT_SCHEMA_REVISION,
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  decodeDocument,
  encodeDocument,
} from '../../core'
import type { DecodedDocument, DecodeResult, Opening, Project } from '../../core'
import { schemaPath } from '../../scripts/schema/build-schema.mjs'

const REVISION_WITH_THE_ENTRANCE_FIELD = 2
const REVISION_BEFORE_THE_ENTRANCE_FIELD = 1
const WALL_LENGTH_MM = 4000
const DOOR_POSITION = 0.5

function projectWithOneDoor(entrance: boolean): Project {
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'wall-1' })
  const door: Opening = {
    ...createOpening({
      id: 'door-1',
      type: 'single-swing-door',
      hostWallId: wall.id,
      position: DOOR_POSITION,
    }),
    ...(entrance ? { entrance: true as const } : {}),
  }
  const floor = createFloor('Ground', { id: 'floor-1', walls: [wall] })
  floor.openings = [door]
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors = [floor]
  return project
}

function valueOf(result: DecodeResult): DecodedDocument {
  if (!result.ok) {
    throw new Error(`Expected the decode to succeed: ${JSON.stringify(result.failure)}`)
  }
  return result.value
}

function writtenDocument(project: Project): Json {
  const { bytes } = encodeDocument(project, undefined)
  return JSON.parse(new TextDecoder().decode(bytes))
}

function firstOpeningOf(document: Json): Json {
  const floors = document.floors as { openings: Json[] }[]
  const opening = floors[0]?.openings[0]
  if (opening === undefined) throw new Error('The document has no opening')
  return opening
}

function schemaAt(revision: number): Json {
  const text = readFileSync(resolve(schemaPath(CURRENT_SCHEMA_VERSION, revision)), 'utf8')
  return JSON.parse(text)
}

function withoutTheEntranceField(schema: Json): Json {
  const copy = structuredClone(schema)
  const opening = (copy.definitions as Record<string, Json>).Opening!
  delete (opening.properties as Json).entrance
  delete copy.$id
  return copy
}

describe('the main entrance field on an opening', () => {
  it('survives an encode and a decode, and the written bytes name the current revision', () => {
    const project = projectWithOneDoor(true)

    const written = encodeDocument(project, undefined)
    const decoded = valueOf(decodeDocument(written.bytes))

    expect(decoded.project.floors[0]?.openings[0]?.entrance).toBe(true)
    expect(decoded.project.floors).toEqual(project.floors)
    expect(metaOf(writtenDocument(project)).schemaRevision).toBe(CURRENT_SCHEMA_REVISION)
  })

  it.each([
    { name: 'false', value: false },
    { name: 'a string', value: 'yes' },
  ])('refuses an entrance that is $name', ({ value }) => {
    const document = writtenDocument(projectWithOneDoor(true))
    firstOpeningOf(document).entrance = value

    const result = decodeDocument(bytesOf(document))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe('format-rules')
  })

  it('loads a revision 1 document that has no entrance field, with no migration', () => {
    const document = writtenDocument(projectWithOneDoor(false))
    metaOf(document).schemaRevision = REVISION_BEFORE_THE_ENTRANCE_FIELD
    expect('entrance' in firstOpeningOf(document)).toBe(false)

    const decoded = valueOf(decodeDocument(bytesOf(document)))

    expect(decoded.migratedFrom).toBeUndefined()
    expect(decoded.project.floors[0]?.openings[0]?.entrance).toBeUndefined()
  })

  it('is at or below the revision of this build', () => {
    expect(CURRENT_SCHEMA_REVISION).toBeGreaterThanOrEqual(REVISION_WITH_THE_ENTRANCE_FIELD)
  })

  it('is the only change between the published revision 1 and revision 2 of the schema', () => {
    const revisionOne = schemaAt(REVISION_BEFORE_THE_ENTRANCE_FIELD)
    const revisionTwo = schemaAt(REVISION_WITH_THE_ENTRANCE_FIELD)

    const opening = (revisionTwo.definitions as Record<string, Json>).Opening!
    expect((opening.properties as Json).entrance).toBeDefined()
    expect(withoutTheEntranceField(revisionTwo)).toEqual(withoutTheEntranceField(revisionOne))
  })
})
