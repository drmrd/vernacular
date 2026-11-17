import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SCHEMA_REVISION,
  createEmptyProject,
  createFloor,
  encodeDocument,
} from '../../core'
import type { Project, ProjectShape, SchemaMigration } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FolderProjectStore } from './folder-project-store'

const TARGET_VERSION = 2

interface StoredFloor extends Record<string, unknown> {
  id: string
}

interface StoredDocument {
  meta: { schemaVersion: number } & Record<string, unknown>
  floors: StoredFloor[]
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
function storedDocument(version: number): StoredDocument {
  const document = JSON.parse(
    new TextDecoder().decode(
      encodeDocument(withSchemaVersion(nextProject(), version), undefined).bytes,
    ),
  ) as StoredDocument
  document.floors[0]!['legacyElevation'] = 9
  document.floors[0]!['fromANewerBuild'] = { note: 'planted' }
  return document
}

function storedBytes(version: number): Uint8Array {
  return encode(JSON.stringify(storedDocument(version)))
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

const throwingStep: SchemaMigration = {
  from: 1,
  migrate: () => {
    throw new Error('migration boom')
  },
}

async function directoryHolding(bytes: Uint8Array): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  await directory.writeFile('vernacular.json', bytes)
  return directory
}

describe('FolderProjectStore save-time graft reads the migrated previous file', () => {
  it('keeps a key a migration removed out of the saved file and keeps the unknown key', async () => {
    const directory = await directoryHolding(storedBytes(1))
    const store = new FolderProjectStore(directory, {
      migration: { schemaMigrations: [removeLegacyElevation], targetVersion: TARGET_VERSION },
    })
    await store.loadProject()

    await store.saveProject(nextProject())

    const saved = decode(await directory.readFile('vernacular.json')) as StoredDocument
    expect(saved.floors[0]).not.toHaveProperty('legacyElevation')
    expect(saved.floors[0]).toHaveProperty('fromANewerBuild', { note: 'planted' })
  })

  it('does not run a migration step at save time when the stored file is already at the target version', async () => {
    const directory = await directoryHolding(storedBytes(TARGET_VERSION))
    let migrateCalls = 0
    const countingStep: SchemaMigration = {
      from: 1,
      migrate: (raw) => {
        migrateCalls += 1
        return raw
      },
    }
    const store = new FolderProjectStore(directory, {
      migration: { schemaMigrations: [countingStep], targetVersion: TARGET_VERSION },
    })

    await store.saveProject(nextProject())

    expect(migrateCalls).toBe(0)
  })
})

describe('FolderProjectStore save without a graft when the previous file cannot be migrated', () => {
  const cases: { name: string; stored: Uint8Array; steps: readonly SchemaMigration[] }[] = [
    {
      name: 'is at a newer version than the target',
      stored: storedBytes(TARGET_VERSION + 1),
      steps: [],
    },
    { name: 'fails to migrate', stored: storedBytes(1), steps: [throwingStep] },
    { name: 'parses to an array', stored: encode('[]'), steps: [] },
    { name: 'parses to null', stored: encode('null'), steps: [] },
    { name: 'parses to a string', stored: encode('"text"'), steps: [] },
  ]

  it.each(cases)('saves the next document as it is when the previous file $name', async (entry) => {
    const directory = await directoryHolding(entry.stored)
    const store = new FolderProjectStore(directory, {
      migration: { schemaMigrations: entry.steps, targetVersion: TARGET_VERSION },
    })
    const next = nextProject()

    await expect(store.saveProject(next)).resolves.toBeUndefined()

    const written = JSON.parse(JSON.stringify(next)) as StoredDocument
    written.meta.schemaRevision = CURRENT_SCHEMA_REVISION
    expect(decode(await directory.readFile('vernacular.json'))).toEqual(written)
  })
})

describe('FolderProjectStore save over a stored file that cannot be read', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns, naming the kind of failure, because no unknown data can be kept', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const directory = await directoryHolding(encode('{ this is not json'))
    const store = new FolderProjectStore(directory)

    await store.saveProject(nextProject())

    const warned = warn.mock.calls.map((args) => JSON.stringify(args))
    expect(warned.some((text) => text.includes('not-json'))).toBe(true)
  })
})

describe('FolderProjectStore first save with no stored file', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not warn, because there is no unknown data to lose', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = new FolderProjectStore(new InMemoryDirectory())

    await store.saveProject(nextProject())

    expect(warn).toHaveBeenCalledTimes(0)
  })
})
