import { FILES_STORE, finish, settle, type FileRecord } from './indexeddb-requests'

/** The object store in which earlier versions kept each project as a live object. */
export const LEGACY_STORE = 'projects'

const PROJECT_FILE_NAME = 'vernacular.json'

/** A record carries no time, so a served record reports the start of the Unix epoch. */
export const LEGACY_MODIFIED_AT = new Date(0).toISOString()

interface LegacyRecord {
  id: string
  project: unknown
}

type ReadBack = (path: string) => Promise<Uint8Array | undefined>

function hasLegacyStore(database: IDBDatabase): boolean {
  return database.objectStoreNames.contains(LEGACY_STORE)
}

function legacyStore(database: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return database.transaction(LEGACY_STORE, mode).objectStore(LEGACY_STORE)
}

function legacyPath(id: string): string {
  return `${id}/${PROJECT_FILE_NAME}`
}

function toBytes(record: LegacyRecord): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(record.project))
}

function bytesEqual(first: Uint8Array, second: Uint8Array): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

/** The project id of a path of the form `<id>/vernacular.json`, or undefined for any other path. */
export function legacyProjectId(path: string): string | undefined {
  const suffix = `/${PROJECT_FILE_NAME}`
  if (!path.endsWith(suffix)) {
    return undefined
  }
  const id = path.slice(0, -suffix.length)
  return id !== '' && !id.includes('/') ? id : undefined
}

/** The UTF-8 bytes of the project that a legacy record holds, or undefined when there is none. */
export async function readLegacyFile(
  database: IDBDatabase,
  path: string,
): Promise<Uint8Array | undefined> {
  const id = legacyProjectId(path)
  if (id === undefined || !hasLegacyStore(database)) {
    return undefined
  }
  const record = await settle<LegacyRecord | undefined>(legacyStore(database, 'readonly').get(id))
  return record === undefined ? undefined : toBytes(record)
}

/** Whether a legacy record stands behind the file path. */
export async function hasLegacyFile(database: IDBDatabase, path: string): Promise<boolean> {
  const id = legacyProjectId(path)
  if (id === undefined || !hasLegacyStore(database)) {
    return false
  }
  return (await settle(legacyStore(database, 'readonly').getKey(id))) !== undefined
}

/** The file paths that the legacy records stand for. */
export async function listLegacyPaths(database: IDBDatabase): Promise<string[]> {
  if (!hasLegacyStore(database)) {
    return []
  }
  const ids = (await settle(legacyStore(database, 'readonly').getAllKeys())) as string[]
  return ids.map(legacyPath)
}

/** Deletes the legacy record of a project in the given transaction, when that holds the store. */
export function deleteLegacyRecord(transaction: IDBTransaction, id: string): void {
  if (transaction.objectStoreNames.contains(LEGACY_STORE)) {
    transaction.objectStore(LEGACY_STORE).delete(id)
  }
}

function readFileRecord(database: IDBDatabase, path: string): Promise<Uint8Array | undefined> {
  const request = database.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE).get(path)
  return settle<FileRecord | undefined>(request).then((record) =>
    record === undefined ? undefined : new Uint8Array(record.bytes),
  )
}

/** Writes the file unless one is there already; resolves with whether it wrote. */
function writeUnlessPresent(
  database: IDBDatabase,
  path: string,
  bytes: Uint8Array,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FILES_STORE, 'readwrite')
    const store = transaction.objectStore(FILES_STORE)
    let written = false
    const lookup = store.get(path)
    lookup.onsuccess = () => {
      if (lookup.result === undefined) {
        const record: FileRecord = { path, bytes, modifiedAt: new Date().toISOString() }
        store.put(record)
        written = true
      }
    }
    transaction.oncomplete = () => resolve(written)
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
}

async function convertRecord(database: IDBDatabase, id: string, readBack: ReadBack): Promise<void> {
  const record = await settle<LegacyRecord | undefined>(legacyStore(database, 'readonly').get(id))
  if (record === undefined) {
    return
  }
  const path = legacyPath(id)
  const bytes = toBytes(record)
  if (!(await writeUnlessPresent(database, path, bytes))) {
    return
  }
  const stored = await readBack(path)
  if (stored !== undefined && bytesEqual(stored, bytes)) {
    const transaction = database.transaction(LEGACY_STORE, 'readwrite')
    deleteLegacyRecord(transaction, id)
    await finish(transaction)
    return
  }
  const transaction = database.transaction(FILES_STORE, 'readwrite')
  transaction.objectStore(FILES_STORE).delete(path)
  await finish(transaction)
}

/**
 * Turns each legacy project record into the file `<id>/vernacular.json`. The
 * file holds the UTF-8 bytes of the stored project as JSON. The file is written
 * and read back first, and the record goes only when the two byte sequences are
 * equal; on a mismatch the new file is removed and the record stays. A record
 * whose file exists already is left alone. A database without the legacy store
 * converts nothing.
 */
export async function convertLegacyRecords(
  database: IDBDatabase,
  options: { readBack?: ReadBack } = {},
): Promise<void> {
  if (!hasLegacyStore(database)) {
    return
  }
  const readBack = options.readBack ?? ((path: string) => readFileRecord(database, path))
  const ids = (await settle(legacyStore(database, 'readonly').getAllKeys())) as string[]
  for (const id of ids) {
    await convertRecord(database, id, readBack)
  }
}
