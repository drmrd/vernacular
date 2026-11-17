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

/** What one conversion wrote: the file bytes and the token that marks the file as its own. */
interface WrittenFile {
  bytes: Uint8Array
  token: string
}

function convertedFile(path: string, written: WrittenFile): FileRecord {
  return {
    path,
    bytes: written.bytes,
    modifiedAt: new Date().toISOString(),
    convertedBy: written.token,
  }
}

/**
 * One transaction over both stores reads the record and the file. A record that
 * JSON keeps faithfully and that has no file gets its file, marked with a new
 * token. A file with the same bytes, left by an earlier conversion, lets the
 * record go; the token stays on that file, which every reader treats as an
 * ordinary file. A marked file with other bytes is a converted file that went
 * wrong and was not deleted, so it is replaced by a new marked file. An
 * unmarked file with other bytes was saved by someone and changes nothing.
 * Resolves with what was written, if anything.
 */
function writeFileOfRecord(database: IDBDatabase, id: string): Promise<WrittenFile | undefined> {
  const transaction = database.transaction([FILES_STORE, LEGACY_STORE], 'readwrite')
  const files = transaction.objectStore(FILES_STORE)
  const records = transaction.objectStore(LEGACY_STORE)
  const path = legacyPath(id)
  let written: WrittenFile | undefined
  onResult(records.get(id), (record: LegacyRecord | undefined) => {
    const bytes = record === undefined ? undefined : faithfulJsonBytes(record.project)
    if (bytes === undefined) {
      return
    }
    onResult(files.get(path), (file: FileRecord | undefined) => {
      if (file !== undefined && sameBytes(bytesOfFile(file), bytes)) {
        records.delete(id)
      } else if (file === undefined || file.convertedBy !== undefined) {
        written = { bytes, token: crypto.randomUUID() }
        files.put(convertedFile(path, written))
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

/**
 * Deletes the file in one transaction, only while it still carries the token of
 * this conversion and the record is still there. The token is compared, not the
 * bytes: a file that read back wrong holds wrong bytes. A save by another tab
 * removes the token, so that file stays.
 */
function deleteFileWhenStillOurs(database: IDBDatabase, id: string, token: string): Promise<void> {
  const transaction = database.transaction([FILES_STORE, LEGACY_STORE], 'readwrite')
  const files = transaction.objectStore(FILES_STORE)
  const path = legacyPath(id)
  onResult(files.get(path), (file: FileRecord | undefined) => {
    if (file?.convertedBy !== token) {
      return
    }
    onResult(transaction.objectStore(LEGACY_STORE).getKey(id), (key) => {
      if (key !== undefined) {
        files.delete(path)
      }
    })
  })
  return finish(transaction)
}

async function convertRecord(database: IDBDatabase, id: string, readBack: ReadBack): Promise<void> {
  const written = await writeFileOfRecord(database, id)
  if (written === undefined) {
    return
  }
  const stored = await readBack(legacyPath(id))
  if (stored !== undefined && bytesEqual(stored, written.bytes)) {
    await deleteRecordWhenUnchanged(database, id, written.bytes)
  } else {
    await deleteFileWhenStillOurs(database, id, written.token)
  }
}

/**
 * Turns each legacy project record into the file `<id>/vernacular.json`. Each
 * record converts on its own: one that fails stays and is reported with one
 * warning, and the others still convert. A record converts only when JSON keeps
 * its object unchanged, apart from properties whose value is undefined; any
 * other record stays without a warning and is served as JSON text. The file is written with a token of its own, then read
 * back, and the record goes only when the read-back equals the bytes written and
 * the file and the record still hold them. On a mismatch the stored bytes are
 * wrong, so the file goes while it still carries the token and the record
 * stays. A file with equal bytes left by an earlier conversion lets the record
 * go; a token-marked file with other bytes is replaced; an unmarked file with
 * other bytes was saved by someone and is left alone with the record. A record
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
    } catch (error) {
      // The record stays and the next open tries it again.
      console.warn(`The legacy record "${id}" did not convert and stays.`, error)
    }
  }
}
