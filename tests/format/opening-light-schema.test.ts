// @vitest-environment node
// Pure byte/zip logic; node aligns Uint8Array realms with the fflate-backed codec.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bytesOf, metaOf } from '../fixtures/projects/versions/fixture-documents'
import type { Json } from '../fixtures/projects/versions/fixture-documents'
import {
  CURRENT_SCHEMA_REVISION,
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  decodeDocument,
  encodeDocument,
} from '../../core'
import type { DecodedDocument, DecodeResult, OpeningLight, Project } from '../../core'
import { schemaPath } from '../../scripts/schema/build-schema.mjs'
import { unzipFolder, zipFolder } from '../../storage/zip/zip-codec'

const OBSERVED_AT = '2026-06-21T08:00'
const CLOUD_COVER = 0.4
const EXTENSION_NAMESPACE = 'com.example'
const ARCHIVE_ENTRY_NAME = 'vernacular.json'
const PREVIOUS_REVISION = CURRENT_SCHEMA_REVISION - 1

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

function failureKindOf(document: Json): string | undefined {
  const result = decodeDocument(bytesOf(document))
  return result.ok ? undefined : result.failure.kind
}

function schemaAt(revision: number): Json {
  const text = readFileSync(resolve(schemaPath(CURRENT_SCHEMA_VERSION, revision)), 'utf8')
  return JSON.parse(text)
}

function definitionsOf(schema: Json): Record<string, Json> {
  return schema.definitions as Record<string, Json>
}

function withSortedRequired(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedRequired)
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.entries(value).map(([key, entry]) => {
    const sorted = key === 'required' && Array.isArray(entry) ? [...entry].sort() : entry
    return [key, withSortedRequired(sorted)]
  })
  return Object.fromEntries(entries)
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
    const current = schemaAt(CURRENT_SCHEMA_REVISION)
    const previous = schemaAt(PREVIOUS_REVISION)

    const light = definitionsOf(current).OpeningLight
    expect(light).toBeDefined()
    expect((current.properties as Json).openingLight).toBeDefined()
    expect(current.required as string[]).not.toContain('openingLight')
    expect(withoutTheOpeningLight(current)).toEqual(withoutTheAddress(previous))
  })

  it('leaves the EnvironmentScene definition as it was', () => {
    const current = definitionsOf(schemaAt(CURRENT_SCHEMA_REVISION)).EnvironmentScene
    const previous = definitionsOf(schemaAt(PREVIOUS_REVISION)).EnvironmentScene

    expect(withSortedRequired(current)).toEqual(withSortedRequired(previous))
  })
})
