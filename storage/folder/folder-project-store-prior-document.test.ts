import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor } from '../../core'
import type { Project } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FolderProjectStore } from './folder-project-store'
import { serializeProjectJson } from './project-json'

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
    new TextDecoder().decode(serializeProjectJson(withSchemaVersion(nextProject(), version))),
  ) as StoredDocument
  document.floors[0]!['legacyElevation'] = 9
  document.floors[0]!['fromANewerBuild'] = { note: 'planted' }
  return document
}

function storedBytes(version: number): Uint8Array {
  return encode(JSON.stringify(storedDocument(version)))
}

/** Removes the legacy key and stamps the target version, keeping every other key. */
function removeLegacyElevation(raw: unknown): Project {
  const document = structuredClone(raw) as StoredDocument
  for (const floor of document.floors) {
    delete floor['legacyElevation']
  }
  document.meta.schemaVersion = TARGET_VERSION
  return document as unknown as Project
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
      migrate: removeLegacyElevation,
      targetVersion: TARGET_VERSION,
    })
    await store.loadProject()

    await store.saveProject(nextProject())

    const saved = decode(await directory.readFile('vernacular.json')) as StoredDocument
    expect(saved.floors[0]).not.toHaveProperty('legacyElevation')
    expect(saved.floors[0]).toHaveProperty('fromANewerBuild', { note: 'planted' })
  })

  it('does not call migrate at save time when the stored file is already at the target version', async () => {
    const directory = await directoryHolding(storedBytes(TARGET_VERSION))
    let migrateCalls = 0
    const store = new FolderProjectStore(directory, {
      migrate: (raw) => {
        migrateCalls += 1
        return raw as Project
      },
      targetVersion: TARGET_VERSION,
    })

    await store.saveProject(nextProject())

    expect(migrateCalls).toBe(0)
  })
})

describe('FolderProjectStore save without a graft when the previous file cannot be migrated', () => {
  const cases: { name: string; stored: Uint8Array; migrate: (raw: unknown) => Project }[] = [
    {
      name: 'is at a newer version than the target',
      stored: storedBytes(TARGET_VERSION + 1),
      migrate: (raw) => raw as Project,
    },
    {
      name: 'fails to migrate',
      stored: storedBytes(1),
      migrate: () => {
        throw new Error('migration boom')
      },
    },
    { name: 'parses to an array', stored: encode('[]'), migrate: (raw) => raw as Project },
    { name: 'parses to null', stored: encode('null'), migrate: (raw) => raw as Project },
    { name: 'parses to a string', stored: encode('"text"'), migrate: (raw) => raw as Project },
  ]

  it.each(cases)('saves the next document as it is when the previous file $name', async (entry) => {
    const directory = await directoryHolding(entry.stored)
    const store = new FolderProjectStore(directory, {
      migrate: entry.migrate,
      targetVersion: TARGET_VERSION,
    })
    const next = nextProject()

    await expect(store.saveProject(next)).resolves.toBeUndefined()

    expect(decode(await directory.readFile('vernacular.json'))).toEqual(
      JSON.parse(JSON.stringify(next)),
    )
  })
})
