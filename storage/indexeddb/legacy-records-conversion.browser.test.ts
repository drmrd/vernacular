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
  objectFrom,
  registerDatabaseCleanup,
  seedFirstLayout,
  storedFileBytesOf,
  storedFilePathsOf,
} from './legacy-records-test-kit'
import type { FirstLayoutRecord } from './legacy-records-test-kit'
import { convertLegacyRecords } from './legacy-records'

registerDatabaseCleanup()

const OLDER_VERSION = 8
const BACKUP_DIRECTORY = 'current/.house-backups'
const TIME_TO_PASS_MILLISECONDS = 25

function recordOf(id: string, version = CURRENT_SCHEMA_VERSION): FirstLayoutRecord {
  return { id, project: fixtureDocument(version) }
}

async function seededDatabase(...records: FirstLayoutRecord[]): Promise<string> {
  const name = freshDatabaseName()
  await seedFirstLayout(name, records)
  return name
}

function storeOver(directory: IndexedDbDirectory): WorkspaceDocumentStore {
  return new WorkspaceDocumentStore(new WorkspaceFiles(directory, { durable: true }))
}

/** A directory whose conversion reads back other bytes than it wrote. */
function directoryThatReadsBackWrongBytes(name: string): IndexedDbDirectory {
  const readBack = () => Promise.resolve(Uint8Array.of(0, 1, 2))
  return new IndexedDbDirectory(name, {
    convertLegacy: (database) => convertLegacyRecords(database, { readBack }),
  })
}

describe('converting version 1 records to files at the first open', () => {
  it('writes the project file with the JSON bytes of the stored object and removes the record', async () => {
    const name = await seededDatabase(recordOf('current'))

    await new IndexedDbDirectory(name).readFile(CURRENT_PROJECT_PATH)

    const bytes = await storedFileBytesOf(name, CURRENT_PROJECT_PATH)
    expect(objectFrom(bytes ?? new Uint8Array())).toEqual(recordOf('current').project)
    expect(await firstLayoutRecordsOf(name)).toEqual([])
  })

  it('converts every record, each to the project file of its own id', async () => {
    const otherId = `project-${crypto.randomUUID()}`
    const name = await seededDatabase(recordOf('current'), recordOf(otherId))

    await new IndexedDbDirectory(name).list('')

    expect(await storedFilePathsOf(name)).toEqual([
      CURRENT_PROJECT_PATH,
      `${otherId}/vernacular.json`,
    ])
    expect(await firstLayoutRecordsOf(name)).toEqual([])
  })

  it('keeps a legacy record whose converted file does not read back equal', async () => {
    const name = await seededDatabase(recordOf('current'))
    const directory = directoryThatReadsBackWrongBytes(name)

    const read = await storeOver(directory).read('current')

    expect(await storedFilePathsOf(name)).toEqual([])
    expect(await firstLayoutRecordsOf(name)).toEqual([recordOf('current')])
    expect(read.ok).toBe(true)
  })

  it('writes nothing when a second directory opens the converted database', async () => {
    const name = await seededDatabase(recordOf('current'))
    const first = new IndexedDbDirectory(name)
    await first.readFile(CURRENT_PROJECT_PATH)
    const modifiedBefore = await first.modifiedAt(CURRENT_PROJECT_PATH)
    const bytesBefore = await storedFileBytesOf(name, CURRENT_PROJECT_PATH)
    await new Promise((resolve) => setTimeout(resolve, TIME_TO_PASS_MILLISECONDS))

    const second = new IndexedDbDirectory(name)

    expect(await second.modifiedAt(CURRENT_PROJECT_PATH)).toBe(modifiedBefore)
    expect(await second.readFile(CURRENT_PROJECT_PATH)).toEqual(bytesBefore)
    expect(await storedFileBytesOf(name, CURRENT_PROJECT_PATH)).toEqual(bytesBefore)
  })

  it('leaves a project file that already exists as it is, with every file kept', async () => {
    const name = await seededDatabase(recordOf('current'))
    const newer = Uint8Array.of(9, 8, 7)
    await directoryWithoutConversion(name).writeFile(CURRENT_PROJECT_PATH, newer)
    const pathsBefore = await storedFilePathsOf(name)

    await new IndexedDbDirectory(name).list('')

    expect(await storedFileBytesOf(name, CURRENT_PROJECT_PATH)).toEqual(newer)
    expect(await storedFilePathsOf(name)).toEqual(pathsBefore)
    expect(await firstLayoutRecordsOf(name)).toEqual([recordOf('current')])
  })

  it('opens a version 8 document as migrated, with one backup of the stored object bytes', async () => {
    const name = await seededDatabase(recordOf('current', OLDER_VERSION))
    const directory = new IndexedDbDirectory(name)

    const read = await storeOver(directory).read('current')

    expect(read.ok && read.value.migratedFrom).toBe(OLDER_VERSION)
    const backups = await directory.list(BACKUP_DIRECTORY)
    expect(backups).toHaveLength(1)
    const backup = await directory.readFile(`${BACKUP_DIRECTORY}/${backups[0]}`)
    expect(backup).toEqual(jsonBytesOf(recordOf('current', OLDER_VERSION).project))
  })
})
