import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { fixtureDocument } from '../../tests/fixtures/projects/versions/fixture-documents'
import { WorkspaceDocumentStore } from '../documents/document-store'
import { WorkspaceFiles } from '../project-files/workspace-files'
import { IndexedDbDirectory } from './indexeddb-directory'
import {
  CURRENT_PROJECT_PATH,
  directoryWithoutConversion,
  firstLayoutRecordsOf,
  freshDatabaseName,
  jsonBytesOf,
  registerDatabaseCleanup,
  seedFirstLayout,
  storedFilePathsOf,
} from './legacy-records-test-kit'
import type { FirstLayoutRecord } from './legacy-records-test-kit'

registerDatabaseCleanup()

function currentRecord(): FirstLayoutRecord {
  return { id: 'current', project: fixtureDocument(CURRENT_SCHEMA_VERSION) }
}

async function seededDatabase(): Promise<string> {
  const name = freshDatabaseName()
  await seedFirstLayout(name, [currentRecord()])
  return name
}

function filesOver(directory: IndexedDbDirectory): WorkspaceFiles {
  return new WorkspaceFiles(directory, { durable: true })
}

describe('a version 1 record before any conversion', () => {
  it('stays in the database, with its record, when the directory upgrades it', async () => {
    const name = await seededDatabase()

    await directoryWithoutConversion(name).list('')

    expect(await firstLayoutRecordsOf(name)).toEqual([currentRecord()])
  })

  it('is served as the project file with the JSON bytes of the stored object', async () => {
    const directory = directoryWithoutConversion(await seededDatabase())

    const bytes = await directory.readFile(CURRENT_PROJECT_PATH)

    expect(bytes).toEqual(jsonBytesOf(currentRecord().project))
  })

  it('is listed as a project of the workspace', async () => {
    const directory = directoryWithoutConversion(await seededDatabase())

    expect(await filesOver(directory).ids()).toEqual(['current'])
    expect(await directory.list('current')).toEqual(['vernacular.json'])
  })

  it('reads as a project through the document store', async () => {
    const directory = directoryWithoutConversion(await seededDatabase())

    const read = await new WorkspaceDocumentStore(filesOver(directory)).read('current')

    expect(read.ok).toBe(true)
  })

  it('is served with a modification time that reads as an ISO instant', async () => {
    const directory = directoryWithoutConversion(await seededDatabase())

    const modified = await directory.modifiedAt(CURRENT_PROJECT_PATH)

    expect(new Date(Date.parse(modified ?? '')).toISOString()).toBe(modified)
  })
})

describe('removing a project whose record is not yet a file', () => {
  it('leaves no project behind, even for a new directory over the same database', async () => {
    const name = await seededDatabase()
    const directory = directoryWithoutConversion(name)

    await directory.removeTree('current')

    expect(await filesOver(directory).ids()).toEqual([])
    expect(await filesOver(directoryWithoutConversion(name)).ids()).toEqual([])
    expect(await firstLayoutRecordsOf(name)).toEqual([])
  })

  it('deletes the record when the project file itself is removed', async () => {
    const name = await seededDatabase()
    const directory = directoryWithoutConversion(name)

    await directory.removeFile(CURRENT_PROJECT_PATH)

    expect(await directory.readFile(CURRENT_PROJECT_PATH)).toBeUndefined()
    expect(await firstLayoutRecordsOf(name)).toEqual([])
  })
})

describe('a database that never held version 1 data', () => {
  it('opens, lists nothing, and stores a file', async () => {
    const directory = new IndexedDbDirectory(freshDatabaseName())
    expect(await directory.list('')).toEqual([])

    await directory.writeFile('a/doc.json', Uint8Array.of(1, 2))

    expect(await directory.readFile('a/doc.json')).toEqual(Uint8Array.of(1, 2))
  })

  it('has no projects store and writes only the file that was stored', async () => {
    const name = freshDatabaseName()
    await new IndexedDbDirectory(name).writeFile('a/doc.json', Uint8Array.of(1))

    expect(await firstLayoutRecordsOf(name)).toBeUndefined()
    expect(await storedFilePathsOf(name)).toEqual(['a/doc.json'])
  })
})
