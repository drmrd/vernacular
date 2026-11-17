import { assertProjectId } from '../project-files/project-id-guard'
import { FILES_STORE, finish, readFileRecord, settle, type FileRecord } from './indexeddb-requests'
import { faithfulJsonBytes, jsonBytes } from './legacy-json'

/** The object store in which earlier versions kept each project as a live object. */
export const LEGACY_STORE = 'projects'

const PROJECT_FILE_NAME = 'vernacular.json'

/**
 * A record carries no time, so a served record reports the start of the Unix
 * epoch. That sorts it after every file in a list ordered newest first.
 */
export const LEGACY_MODIFIED_AT = new Date(0).toISOString()

interface LegacyRecord {
  id: unknown
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

function bytesEqual(first: Uint8Array, second: Uint8Array): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

/** Whether the id can name a project directory; the project id guard holds the rule. */
function isLegacyProjectId(id: unknown): id is string {
  if (typeof id !== 'string') {
    return false
  }
  try {
    assertProjectId(id)
    return true
  } catch {
    return false
  }
}

/** The project id of a path of the form `<id>/vernacular.json`, or undefined for any other path. */
export function legacyProjectId(path: string): string | undefined {
  const suffix = `/${PROJECT_FILE_NAME}`
  if (!path.endsWith(suffix)) {
    return undefined
  }
  const id = path.slice(0, -suffix.length)
  return isLegacyProjectId(id) ? id : undefined
}

/** The record of a project, or undefined when there is none or it holds no project. */
async function readLegacyRecord(
  database: IDBDatabase,
  id: string,
): Promise<LegacyRecord | undefined> {
  const record = await settle<LegacyRecord | undefined>(legacyStore(database, 'readonly').get(id))
  return record?.project === undefined ? undefined : record
}

/**
 * The UTF-8 JSON bytes of the project that a legacy record holds, or undefined
 * when there is none. Rejects with an Error that names JSON when the stored
 * object cannot be written as JSON.
 */
export async function readLegacyFile(
  database: IDBDatabase,
  path: string,
): Promise<Uint8Array | undefined> {
  const id = legacyProjectId(path)
  if (id === undefined || !hasLegacyStore(database)) {
    return undefined
  }
  const record = await readLegacyRecord(database, id)
  return record === undefined ? undefined : jsonBytes(record.project)
}

/** Whether a legacy record that holds a project stands behind the file path. */
export async function hasLegacyFile(database: IDBDatabase, path: string): Promise<boolean> {
  const id = legacyProjectId(path)
  if (id === undefined || !hasLegacyStore(database)) {
    return false
  }
  return (await readLegacyRecord(database, id)) !== undefined
}

/** The file paths that the legacy records with a valid id and a project stand for. */
export async function listLegacyPaths(database: IDBDatabase): Promise<string[]> {
  if (!hasLegacyStore(database)) {
    return []
  }
  const records = await settle<LegacyRecord[]>(legacyStore(database, 'readonly').getAll())
  return records.flatMap((record) =>
    isLegacyProjectId(record.id) && record.project !== undefined ? [legacyPath(record.id)] : [],
  )
}

/** Deletes the legacy record of a project in the given transaction, when that holds the store. */
export function deleteLegacyRecord(transaction: IDBTransaction, id: string): void {
  if (isLegacyProjectId(id) && transaction.objectStoreNames.contains(LEGACY_STORE)) {
    transaction.objectStore(LEGACY_STORE).delete(id)
  }
}

function onResult<T>(request: IDBRequest<T>, handle: (result: T) => void): void {
  request.onsuccess = () => handle(request.result)
}

function bytesOfFile(file: FileRecord | undefined): Uint8Array | undefined {
  return file === undefined ? undefined : new Uint8Array(file.bytes)
}

function sameBytes(stored: Uint8Array | undefined, bytes: Uint8Array): boolean {
  return stored !== undefined && bytesEqual(stored, bytes)
}

/**
 * One transaction over both stores reads the record and the file. A record that
 * JSON keeps faithfully and that has no file gets its file. A record whose file
 * holds the same bytes, left by an earlier conversion, loses the record. A file
 * with other bytes changes nothing. Resolves with the bytes written, if any.
 */
function writeFileOfRecord(database: IDBDatabase, id: string): Promise<Uint8Array | undefined> {
  const transaction = database.transaction([FILES_STORE, LEGACY_STORE], 'readwrite')
  const files = transaction.objectStore(FILES_STORE)
  const records = transaction.objectStore(LEGACY_STORE)
  const path = legacyPath(id)
  let written: Uint8Array | undefined
  onResult(records.get(id), (record: LegacyRecord | undefined) => {
    const bytes = record === undefined ? undefined : faithfulJsonBytes(record.project)
    if (bytes === undefined) {
      return
    }
    onResult(files.get(path), (file: FileRecord | undefined) => {
      if (file === undefined) {
        files.put({ path, bytes, modifiedAt: new Date().toISOString() } satisfies FileRecord)
        written = bytes
      } else if (sameBytes(bytesOfFile(file), bytes)) {
        records.delete(id)
      }
    })
  })
  return finish(transaction).then(() => written)
}

/** Deletes the record in one transaction, only when the file and the record still hold these bytes. */
function deleteRecordWhenUnchanged(
  database: IDBDatabase,
  id: string,
  bytes: Uint8Array,
): Promise<void> {
  const transaction = database.transaction([FILES_STORE, LEGACY_STORE], 'readwrite')
  const records = transaction.objectStore(LEGACY_STORE)
  onResult(transaction.objectStore(FILES_STORE).get(legacyPath(id)), (file) => {
    if (!sameBytes(bytesOfFile(file), bytes)) {
      return
    }
    onResult(records.get(id), (record: LegacyRecord | undefined) => {
      if (record !== undefined && sameBytes(faithfulJsonBytes(record.project), bytes)) {
        records.delete(id)
      }
    })
  })
  return finish(transaction)
}

/** Deletes the file in one transaction, only when it still holds exactly the bytes this conversion wrote. */
function deleteFileWhenUnchanged(
  database: IDBDatabase,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const transaction = database.transaction(FILES_STORE, 'readwrite')
  const files = transaction.objectStore(FILES_STORE)
  onResult(files.get(path), (file: FileRecord | undefined) => {
    if (sameBytes(bytesOfFile(file), bytes)) {
      files.delete(path)
    }
  })
  return finish(transaction)
}

async function convertRecord(database: IDBDatabase, id: string, readBack: ReadBack): Promise<void> {
  const bytes = await writeFileOfRecord(database, id)
  if (bytes === undefined) {
    return
  }
  const path = legacyPath(id)
  const stored = await readBack(path)
  if (stored !== undefined && bytesEqual(stored, bytes)) {
    await deleteRecordWhenUnchanged(database, id, bytes)
  } else {
    await deleteFileWhenUnchanged(database, path, bytes)
  }
}

/**
 * Turns each legacy project record into the file `<id>/vernacular.json`. Each
 * record converts on its own: one that fails stays, and the others still
 * convert. A record converts only when JSON keeps its object unchanged, apart
 * from properties whose value is undefined; any other record stays and is
 * served as JSON text. The file is written, then read back, and the record goes
 * only when the read-back equals the bytes written and the file and the record
 * still hold them; on a mismatch only a file that still holds the bytes written
 * is removed. A file with equal bytes left by an earlier conversion lets the
 * record go; a file with other bytes is left alone with the record. A record
 * whose id cannot name a project directory is ignored. A database without the
 * legacy store converts nothing.
 */
export async function convertLegacyRecords(
  database: IDBDatabase,
  options: { readBack?: ReadBack } = {},
): Promise<void> {
  if (!hasLegacyStore(database)) {
    return
  }
  const readBack =
    options.readBack ?? (async (path: string) => bytesOfFile(await readFileRecord(database, path)))
  const keys = await settle(legacyStore(database, 'readonly').getAllKeys())
  for (const id of keys.filter(isLegacyProjectId)) {
    try {
      await convertRecord(database, id, readBack)
    } catch {
      // The record stays and the next open tries it again.
    }
  }
}
