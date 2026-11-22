// @vitest-environment node
// Pure byte/zip logic; node aligns Uint8Array realms with the fflate-backed codec.
import { describe, expect, it } from 'vitest'
import { bytesOf, metaOf } from '../fixtures/projects/versions/fixture-documents'
import type { Json } from '../fixtures/projects/versions/fixture-documents'
import {
  CURRENT_SCHEMA_REVISION,
  createEmptyProject,
  decodeDocument,
  encodeDocument,
} from '../../core'
import type { OpeningLight, Project } from '../../core'
import { unzipFolder, zipFolder } from '../../storage/zip/zip-codec'
import {
  definitionsOf,
  schemaAt,
  valueOf,
  withSortedRequired,
  writtenDocument,
} from './schema-revision-test-support'

const OBSERVED_AT = '2026-06-21T08:00'
const CLOUD_COVER = 0.4
const EXTENSION_NAMESPACE = 'com.example'
const ARCHIVE_ENTRY_NAME = 'vernacular.json'
const REVISION_WITH_THE_OPENING_LIGHT = 3
const REVISION_BEFORE_THE_OPENING_LIGHT = 2

const STORED_LIGHT: OpeningLight = { observedAt: OBSERVED_AT, weather: { cloudCover: CLOUD_COVER } }
const LIGHT_WITH_EXTENSIONS: OpeningLight = {
  ...STORED_LIGHT,
  extensions: { [EXTENSION_NAMESPACE]: { note: 'kept' } },
}

function projectWith(openingLight?: OpeningLight): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  return openingLight === undefined ? project : { ...project, openingLight }
}

function failureKindOf(document: Json): string | undefined {
  const result = decodeDocument(bytesOf(document))
  return result.ok ? undefined : result.failure.kind
}

function withoutTheOpeningLight(schema: Json): unknown {
  const copy = structuredClone(schema)
  delete copy.$id
  const definitions = definitionsOf(copy)
  delete (copy.properties as Json).openingLight
  delete definitions.OpeningLight
  return withSortedRequired(copy)
}

function withoutTheAddress(schema: Json): unknown {
  const copy = structuredClone(schema)
  delete copy.$id
  return withSortedRequired(copy)
}

describe('the opening light on a project', () => {
  it('survives an encode and a decode, and the written bytes name the current revision', () => {
    const project = projectWith(STORED_LIGHT)

    const written = encodeDocument(project, undefined)
    const decoded = valueOf(decodeDocument(written.bytes))

    expect(decoded.project).toEqual({
      ...project,
      meta: { ...project.meta, schemaRevision: CURRENT_SCHEMA_REVISION },
    })
    expect(metaOf(writtenDocument(project)).schemaRevision).toBe(CURRENT_SCHEMA_REVISION)
  })

  it('keeps the extensions of the light through an encode and a decode', () => {
    const project = projectWith(LIGHT_WITH_EXTENSIONS)

    const decoded = valueOf(decodeDocument(encodeDocument(project, undefined).bytes))

    expect(decoded.project.openingLight).toEqual(LIGHT_WITH_EXTENSIONS)
  })

  it.each([
    { name: 'null', light: null },
    { name: 'a record with no observedAt', light: { weather: { cloudCover: CLOUD_COVER } } },
  ])('refuses a light that is $name', ({ light }) => {
    const document = writtenDocument(projectWith(STORED_LIGHT))
    document.openingLight = light

    expect(failureKindOf(document)).toBe('format-rules')
  })

  it('loads a document that has no light, with no migration', () => {
    const document = writtenDocument(projectWith())
    expect('openingLight' in document).toBe(false)

    const decoded = valueOf(decodeDocument(bytesOf(document)))

    expect(decoded.migratedFrom).toBeUndefined()
    expect(decoded.project.openingLight).toBeUndefined()
  })

  it('loads a document that has a saved scene and no light', () => {
    const scene = { id: 'scene-1', name: 'Noon', observedAt: OBSERVED_AT }
    const project = { ...projectWith(), environmentScenes: [scene] }

    const decoded = valueOf(decodeDocument(encodeDocument(project, undefined).bytes))

    expect(decoded.project.environmentScenes).toEqual([scene])
    expect(decoded.project.openingLight).toBeUndefined()
  })

  it('accepts a malformed observedAt, because the reader ignores it at open', () => {
    const document = writtenDocument(projectWith(STORED_LIGHT))
    document.openingLight = { observedAt: 'noon' }

    const decoded = valueOf(decodeDocument(bytesOf(document)))

    expect(decoded.project.openingLight?.observedAt).toBe('noon')
  })

  it('writes no openingLight key for a project with no light', () => {
    expect('openingLight' in writtenDocument(projectWith())).toBe(false)
  })

  it('survives a round trip through a .building archive', () => {
    const project = projectWith(LIGHT_WITH_EXTENSIONS)
    const entries = new Map([[ARCHIVE_ENTRY_NAME, encodeDocument(project, undefined).bytes]])

    const unpacked = unzipFolder(zipFolder(entries))

    const bytes = unpacked.get(ARCHIVE_ENTRY_NAME)
    expect(bytes).toBeDefined()
    expect(valueOf(decodeDocument(bytes!)).project.openingLight).toEqual(LIGHT_WITH_EXTENSIONS)
  })
})

describe('the schema revision that adds the opening light', () => {
  it('differs from the previous revision only by the opening light', () => {
    const current = schemaAt(REVISION_WITH_THE_OPENING_LIGHT)
    const previous = schemaAt(REVISION_BEFORE_THE_OPENING_LIGHT)

    const light = definitionsOf(current).OpeningLight
    expect(light).toBeDefined()
    expect((current.properties as Json).openingLight).toBeDefined()
    expect(current.required as string[]).not.toContain('openingLight')
    expect(withoutTheOpeningLight(current)).toEqual(withoutTheAddress(previous))
  })

  it('leaves the EnvironmentScene definition as it was', () => {
    const current = definitionsOf(schemaAt(REVISION_WITH_THE_OPENING_LIGHT)).EnvironmentScene
    const previous = definitionsOf(schemaAt(REVISION_BEFORE_THE_OPENING_LIGHT)).EnvironmentScene

    expect(withSortedRequired(current)).toEqual(withSortedRequired(previous))
  })
})
