import { afterEach } from 'vitest'
import { bytesOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import { IndexedDbDirectory } from './indexeddb-directory'

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
export async function seedFirstLayout(
  name: string,
  records: readonly FirstLayoutRecord[],
): Promise<void> {
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
