import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { fixtureDocument } from '../../tests/fixtures/projects/versions/fixture-documents'
import { WorkspaceDocumentStore } from '../documents/document-store'
import { IndexedDbDirectory } from './indexeddb-directory'
import {
  CURRENT_PROJECT_PATH,
  directoryWithoutConversion,
  freshDatabaseName,
  jsonBytesOf,
  legacyRecordsOf,
  registerDatabaseCleanup,
  seededDatabase,
  storedFilePathsOf,
  workspaceOver,
} from './legacy-records-test-kit'
import type { LegacyRecord } from './legacy-records-test-kit'

registerDatabaseCleanup()

function currentRecord(): LegacyRecord {
  return { id: 'current', project: fixtureDocument(CURRENT_SCHEMA_VERSION) }
}

describe('a version 1 record before any conversion', () => {
  it('stays in the database, with its record, when the directory upgrades it', async () => {
    const name = await seededDatabase(currentRecord())

    await directoryWithoutConversion(name).list('')

    expect(await legacyRecordsOf(name)).toEqual([currentRecord()])
  })

  it('is served as the project file with the JSON bytes of the stored object', async () => {
    const directory = directoryWithoutConversion(await seededDatabase(currentRecord()))

    const bytes = await directory.readFile(CURRENT_PROJECT_PATH)

    expect(bytes).toEqual(jsonBytesOf(currentRecord().project))
  })

  it('is listed as a project of the workspace', async () => {
    const directory = directoryWithoutConversion(await seededDatabase(currentRecord()))

    expect(await workspaceOver(directory).ids()).toEqual(['current'])
    expect(await directory.list('current')).toEqual(['vernacular.json'])
  })

  it('reads as a project through the document store', async () => {
    const directory = directoryWithoutConversion(await seededDatabase(currentRecord()))

    const read = await new WorkspaceDocumentStore(workspaceOver(directory)).read('current')

    expect(read.ok).toBe(true)
  })

  it('is served with a modification time that reads as an ISO instant', async () => {
    const directory = directoryWithoutConversion(await seededDatabase(currentRecord()))

    const modified = await directory.modifiedAt(CURRENT_PROJECT_PATH)

    expect(new Date(Date.parse(modified ?? '')).toISOString()).toBe(modified)
  })
})

describe('removing a project whose record is not yet a file', () => {
  it('leaves no project behind, even for a new directory over the same database', async () => {
    const name = await seededDatabase(currentRecord())
    const directory = directoryWithoutConversion(name)

    await directory.removeTree('current')

    expect(await workspaceOver(directory).ids()).toEqual([])
    expect(await workspaceOver(directoryWithoutConversion(name)).ids()).toEqual([])
    expect(await legacyRecordsOf(name)).toEqual([])
  })

  it('deletes the record when the project file itself is removed', async () => {
    const name = await seededDatabase(currentRecord())
    const directory = directoryWithoutConversion(name)

    await directory.removeFile(CURRENT_PROJECT_PATH)

    expect(await directory.readFile(CURRENT_PROJECT_PATH)).toBeUndefined()
    expect(await legacyRecordsOf(name)).toEqual([])
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

    expect(await legacyRecordsOf(name)).toBeUndefined()
    expect(await storedFilePathsOf(name)).toEqual(['a/doc.json'])
  })
})
