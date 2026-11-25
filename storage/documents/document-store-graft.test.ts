import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SCHEMA_REVISION,
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  createFloor,
  createWall,
  decodeDocument,
  encodeDocument,
} from '../../core'
import type { CodecOptions, Project, ProjectShape, SchemaMigration } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FolderFiles } from '../project-files/folder-files'
import { DocumentStore } from './document-store'

const PROJECT_ID = 'house'
const DOCUMENT_PATH = 'vernacular.json'
const TARGET_VERSION = 2

interface StoredFloor extends Record<string, unknown> {
  id: string
}

interface StoredDocument {
  meta: { schemaVersion: number } & Record<string, unknown>
  floors: StoredFloor[]
}

interface SavedDocument {
  meta: { name: string }
  annotations?: unknown
  floors: { trim?: unknown; walls: { curve?: unknown }[] }[]
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function decode(bytes: Uint8Array | undefined): unknown {
  return JSON.parse(new TextDecoder().decode(bytes!))
}

function withSchemaVersion(project: Project, version: number): Project {
  return { ...project, meta: { ...project.meta, schemaVersion: version } }
}

function storeOver(directory: InMemoryDirectory, options?: CodecOptions): DocumentStore {
  return new DocumentStore(new FolderFiles(PROJECT_ID, directory, { durable: true }), options)
}

async function directoryHolding(bytes: Uint8Array): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  await directory.writeFile(DOCUMENT_PATH, bytes)
  return directory
}

function migrationTo(steps: readonly SchemaMigration[]): CodecOptions {
  return { migration: { schemaMigrations: steps, targetVersion: TARGET_VERSION } }
}

/** The document the editor model produces: known keys only, at the target version. */
function nextProject(): Project {
  const project = createEmptyProject({
    name: 'Renamed',
    units: 'imperial',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors.push(createFloor('Ground', { id: 'f1', elevation: 0, walls: [] }))
  return withSchemaVersion(project, TARGET_VERSION)
}

/** A stored file that carries one key an old migration removes and one key nobody knows. */
function storedBytes(version: number): Uint8Array {
  const document = JSON.parse(
    new TextDecoder().decode(
      encodeDocument(withSchemaVersion(nextProject(), version), undefined).bytes,
    ),
  ) as StoredDocument
  document.floors[0]!['legacyElevation'] = 9
  document.floors[0]!['fromANewerBuild'] = { note: 'planted' }
  return encode(JSON.stringify(document))
}

/** A step from version 1 that removes the legacy key and keeps every other key. */
const removeLegacyElevation: SchemaMigration = {
  from: 1,
  migrate: (raw) => {
    const document = structuredClone(raw) as unknown as StoredDocument
    for (const floor of document.floors) {
      delete floor['legacyElevation']
    }
    return document as unknown as ProjectShape
  },
}

describe('a save grafts from the migrated previous file', () => {
  it('keeps a key a migration removed out of the saved file and keeps the unknown key', async () => {
    const directory = await directoryHolding(storedBytes(1))
    const store = storeOver(directory, migrationTo([removeLegacyElevation]))

    await store.save(PROJECT_ID, nextProject())

    const saved = decode(await directory.readFile(DOCUMENT_PATH)) as StoredDocument
    expect(saved.floors[0]).not.toHaveProperty('legacyElevation')
    expect(saved.floors[0]).toHaveProperty('fromANewerBuild', { note: 'planted' })
  })

  it('runs no migration step at save time when the stored file is already at the target version', async () => {
    const directory = await directoryHolding(storedBytes(TARGET_VERSION))
    let migrateCalls = 0
    const countingStep: SchemaMigration = {
      from: 1,
      migrate: (raw) => {
        migrateCalls += 1
        return raw
      },
    }
    const store = storeOver(directory, migrationTo([countingStep]))

    await store.save(PROJECT_ID, nextProject())

    expect(migrateCalls).toBe(0)
  })
})

function priorDocumentBytes(): Uint8Array {
  const document = {
    meta: {
      name: 'Original',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: '0.0.0',
      registryVersions: {},
    },
    floors: [
      {
        id: 'f1',
        name: 'Ground',
        elevation: 0,
        defaultCeilingHeight: 2400,
        walls: [
          {
            id: 'w1',
            start: { x: 0, y: 0 },
            end: { x: 1000, y: 0 },
            thickness: 100,
            curve: { radius: 50 },
          },
        ],
        openings: [],
        dimensions: [],
        underlays: [],
        trim: { profile: 'ogee' },
      },
    ],
    stairs: [],
    annotations: { northArrow: { angle: 12 } },
  }
  return encode(JSON.stringify(document))
}

function projectKeeping(walls: ReturnType<typeof createWall>[]): Project {
  const project = createEmptyProject({
    name: 'Renamed',
    units: 'imperial',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors.push(createFloor('Ground', { id: 'f1', elevation: 0, walls }))
  return project
}

async function savedAfterSavingOver(
  previous: Uint8Array,
  project: Project,
): Promise<SavedDocument> {
  const directory = await directoryHolding(previous)

  await storeOver(directory).save(PROJECT_ID, project)

  return decode(await directory.readFile(DOCUMENT_PATH)) as SavedDocument
}

describe('a save over a previous file that holds data this build does not know', () => {
  it('restores unknown and reserved keys the saved project dropped, from the previous file', async () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1', thickness: 100 })

    const saved = await savedAfterSavingOver(priorDocumentBytes(), projectKeeping([wall]))

    expect(saved.annotations).toEqual({ northArrow: { angle: 12 } })
    expect(saved.floors[0]?.trim).toEqual({ profile: 'ogee' })
    expect(saved.floors[0]?.walls[0]?.curve).toEqual({ radius: 50 })
    expect(saved.meta.name).toBe('Renamed')
  })

  it('does not resurrect a wall the saved project deleted', async () => {
    const saved = await savedAfterSavingOver(priorDocumentBytes(), projectKeeping([]))

    expect(saved.floors[0]?.walls).toEqual([])
  })
})

describe('a save over a previous file that parses to something other than a document', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const cases = [
    { name: 'an array', previous: encode('[]') },
    { name: 'null', previous: encode('null') },
    { name: 'a string', previous: encode('"text"') },
  ]

  it.each(cases)(
    'writes the next document as it is, and says that no graft was made, for $name',
    async ({ previous }) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const directory = await directoryHolding(previous)
      const next = nextProject()
      const reason = decodeDocument(previous, undefined)
      if (reason.ok) throw new Error('Expected the previous bytes to fail to decode')

      const report = await storeOver(directory).save(PROJECT_ID, next)

      expect(report.graftDropped).toEqual(reason.failure)
      const written = JSON.parse(JSON.stringify(next)) as StoredDocument
      written.meta.schemaRevision = CURRENT_SCHEMA_REVISION
      expect(decode(await directory.readFile(DOCUMENT_PATH))).toEqual(written)
    },
  )
})

describe('the first save of a project with no stored file', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not warn, because there is no unknown data to lose', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await storeOver(new InMemoryDirectory()).save(PROJECT_ID, nextProject())

    expect(warn).toHaveBeenCalledTimes(0)
  })
})
