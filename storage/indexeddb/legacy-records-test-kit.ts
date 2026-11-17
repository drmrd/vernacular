import { afterEach } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { bytesOf, fixtureDocument } from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import { IndexedDbDirectory } from './indexeddb-directory'
import { convertLegacyRecords } from './legacy-records'

/** Shared set-up of the browser tests that cover the records of the first database layout. */

const FIRST_LAYOUT_VERSION = 1
const FIRST_LAYOUT_STORE = 'projects'
const FILE_STORE = 'files'

/** The path that a project named `current` has as a file. */
export const CURRENT_PROJECT_PATH = 'current/vernacular.json'

/** A record of the first layout: the project is a live object, not bytes. */
export interface FirstLayoutRecord {
  readonly id: string
  readonly project: unknown
}

/** A record of the file store, as the directory writes it. */
export interface FileRecord {
  readonly path: string
  readonly bytes: ArrayBuffer | Uint8Array
  readonly modifiedAt: string
  /** The one-off token of a conversion; an ordinary write never sets it. */
  readonly convertedBy?: string
}

const createdDatabases: string[] = []

/** A database name no other test uses; the cleanup registered below deletes it. */
export function freshDatabaseName(): string {
  const name = `vernacular-legacy-records-test-${crypto.randomUUID()}`
  createdDatabases.push(name)
  return name
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/** Deletes every database that `freshDatabaseName` handed out, after each test of the file. */
export function registerDatabaseCleanup(): void {
  afterEach(async () => {
    await Promise.all(createdDatabases.splice(0).map(deleteDatabase))
  })
}

function openDatabase(
  name: string,
  version: number | undefined,
  onUpgrade?: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => onUpgrade?.(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function settled(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/**
 * Creates the database as the first layout left it (version 1, one `projects` store keyed by
 * `id`), puts the records in, and closes that connection before anything else opens the database.
 */
export async function seedFirstLayout(name: string, records: readonly object[]): Promise<void> {
  const database = await openDatabase(name, FIRST_LAYOUT_VERSION, (upgrading) => {
    upgrading.createObjectStore(FIRST_LAYOUT_STORE, { keyPath: 'id' })
  })
  const transaction = database.transaction(FIRST_LAYOUT_STORE, 'readwrite')
  records.forEach((record) => transaction.objectStore(FIRST_LAYOUT_STORE).put(record))
  await settled(transaction)
  database.close()
}

/**
 * Every record of the named store, read through a raw connection at the version the database has
 * now; undefined when the database has no such store. The connection is closed again.
 */
async function recordsOf<T>(name: string, storeName: string): Promise<T[] | undefined> {
  const database = await openDatabase(name, undefined)
  try {
    if (!database.objectStoreNames.contains(storeName)) return undefined
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    return await new Promise<T[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

/** The records that the `projects` store still holds; undefined when the store is gone. */
export function firstLayoutRecordsOf(name: string): Promise<FirstLayoutRecord[] | undefined> {
  return recordsOf<FirstLayoutRecord>(name, FIRST_LAYOUT_STORE)
}

/** The records of the `files` store; undefined when the store does not exist. */
export function fileRecordsOf(name: string): Promise<FileRecord[] | undefined> {
  return recordsOf<FileRecord>(name, FILE_STORE)
}

/** The paths of the `files` store, sorted. */
export async function storedFilePathsOf(name: string): Promise<string[]> {
  const records = (await fileRecordsOf(name)) ?? []
  return records.map((record) => record.path).sort()
}

/** The bytes of the record at `path` in the `files` store; undefined when there is none. */
export async function storedFileBytesOf(
  name: string,
  path: string,
): Promise<Uint8Array | undefined> {
  const record = (await fileRecordsOf(name))?.find((candidate) => candidate.path === path)
  return record === undefined ? undefined : new Uint8Array(record.bytes)
}

/** The JSON text of `value` as UTF-8, which is what a converted file holds. */
export function jsonBytesOf(value: unknown): Uint8Array {
  return bytesOf(value)
}

/** The object that UTF-8 JSON bytes hold. */
export function objectFrom(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** A directory that leaves the records of the first layout alone, so a test sees them as they are. */
export function directoryWithoutConversion(name: string): IndexedDbDirectory {
  return new IndexedDbDirectory(name, { convertLegacy: () => Promise.resolve() })
}

/** Puts a record into the `files` store through a raw connection, as another tab's save would. */
export async function putFileRecord(name: string, record: FileRecord): Promise<void> {
  const database = await openDatabase(name, undefined)
  try {
    const transaction = database.transaction(FILE_STORE, 'readwrite')
    transaction.objectStore(FILE_STORE).put(record)
    await settled(transaction)
  } finally {
    database.close()
  }
}

/** The raw `id` values of the records that the `projects` store still holds, in key order. */
export async function firstLayoutIdsOf(name: string): Promise<unknown[]> {
  const records = (await firstLayoutRecordsOf(name)) ?? []
  return records.map((record) => record.id)
}

/** The project of the current fixture, as a fresh object. */
export function currentProject(): Json {
  return fixtureDocument(CURRENT_SCHEMA_VERSION)
}

/** A fresh database in the first layout that holds the records. */
export async function seededDatabase(...records: object[]): Promise<string> {
  const name = freshDatabaseName()
  await seedFirstLayout(name, records)
  return name
}

/** A directory whose conversion reads back through `readBack`. */
export function directoryReadingBackWith(
  name: string,
  readBack: (path: string) => Promise<Uint8Array | undefined>,
): IndexedDbDirectory {
  return new IndexedDbDirectory(name, {
    convertLegacy: (database) => convertLegacyRecords(database, { readBack }),
  })
}

/** The raw record of the `files` store at `path`; undefined when there is none. */
export async function fileRecordAt(name: string, path: string): Promise<FileRecord | undefined> {
  return (await fileRecordsOf(name))?.find((candidate) => candidate.path === path)
}

/** Puts the record at `path` back with other bytes and every other field unchanged. */
export async function replaceStoredBytes(
  name: string,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const record = await fileRecordAt(name, path)
  if (record === undefined) throw new Error(`No file record at ${path}`)
  await putFileRecord(name, { ...record, bytes })
}

/** Deletes only the record of the `files` store at `path`, through a raw connection. */
export async function deleteStoredFile(name: string, path: string): Promise<void> {
  const database = await openDatabase(name, undefined)
  try {
    const transaction = database.transaction(FILE_STORE, 'readwrite')
    transaction.objectStore(FILE_STORE).delete(path)
    await settled(transaction)
  } finally {
    database.close()
  }
}

/**
 * Deletes the database of this name now, for a test that has to use a name it cannot choose, such
 * as the default one of the application.
 */
export function deleteDatabaseNamed(name: string): Promise<void> {
  return deleteDatabase(name)
}
